import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { deterministicId, sha256 } from "./ids";
import { redactSecrets } from "./security";
import { appendEvent, createRecord, readAllRecords, readRecord, updateRecord } from "./vault";
import { AutoTinkerError, type CanonicalRecord } from "./types";

export interface HistoryCaptureInput {
  title: string;
  summary: string;
  occurred_at?: string;
  source_refs?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ImportCandidate extends HistoryCaptureInput {
  source_fingerprint: string;
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const object = item as Record<string, unknown>;
          return textFromContent(object.text ?? object.content ?? object.input_text ?? object.output_text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["summary", "message", "text", "content", "input_text", "output_text"]) {
      const found = textFromContent(object[key]);
      if (found) return found;
    }
  }
  return "";
}

function candidateFromObject(object: Record<string, unknown>, sourceRef: string): ImportCandidate | undefined {
  const payload = object.payload && typeof object.payload === "object" ? (object.payload as Record<string, unknown>) : object;
  const role = typeof payload.role === "string" ? payload.role : typeof object.role === "string" ? object.role : undefined;
  const text = redactSecrets(
    textFromContent(payload.content ?? payload.message ?? payload.text ?? payload.summary ?? object.content ?? object.message).trim(),
  );
  if (!text || text.length < 8) return undefined;
  const timestampValue = payload.timestamp ?? payload.created_at ?? object.timestamp ?? object.created_at;
  const occurredAt =
    typeof timestampValue === "string" && !Number.isNaN(Date.parse(timestampValue))
      ? new Date(timestampValue).toISOString()
      : undefined;
  const compact = text.replace(/\s+/g, " ");
  const titleHint = typeof payload.title === "string" ? payload.title : compact;
  const title = redactSecrets(titleHint).slice(0, 90) || "Imported work history";
  const fingerprint = sha256(JSON.stringify({ role, text, occurredAt }));
  return {
    title,
    summary: text.slice(0, 20_000),
    occurred_at: occurredAt,
    source_refs: [sourceRef],
    tags: ["history-import", ...(role ? [role] : [])],
    source_fingerprint: fingerprint,
    metadata: { ...(role ? { role } : {}) },
  };
}

async function sourceFiles(input: string): Promise<string[]> {
  const info = await stat(input).catch(() => undefined);
  if (!info) throw new AutoTinkerError("IMPORT_NOT_FOUND", `History source does not exist: ${input}`);
  if (info.isFile()) return [input];
  if (!info.isDirectory()) throw new AutoTinkerError("INVALID_IMPORT", `History source must be a file or directory: ${input}`);
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && /\.(?:jsonl|json|md|txt)$/i.test(entry.name)) files.push(absolute);
    }
  }
  await walk(input);
  return files.sort();
}

async function candidatesFromFile(file: string): Promise<ImportCandidate[]> {
  const contents = await readFile(file, "utf8");
  const extension = path.extname(file).toLowerCase();
  const candidates: ImportCandidate[] = [];
  if (extension === ".jsonl") {
    const lines = contents.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      try {
        const parsed = JSON.parse(lines[index]);
        if (parsed && typeof parsed === "object") {
          const candidate = candidateFromObject(parsed as Record<string, unknown>, `${file}#L${index + 1}`);
          if (candidate) candidates.push(candidate);
        }
      } catch {
        // JSONL archives can contain partial trailing records; import remains bounded.
      }
    }
  } else if (extension === ".json") {
    const parsed = JSON.parse(contents) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    values.forEach((value, index) => {
      if (value && typeof value === "object") {
        const candidate = candidateFromObject(value as Record<string, unknown>, `${file}#${index + 1}`);
        if (candidate) candidates.push(candidate);
      }
    });
  } else {
    const text = redactSecrets(contents.trim());
    if (text) {
      const fingerprint = sha256(text);
      candidates.push({
        title: text.replace(/^#+\s*/, "").split(/\r?\n/)[0].slice(0, 90) || path.basename(file),
        summary: text.slice(0, 20_000),
        source_refs: [file],
        tags: ["history-import"],
        source_fingerprint: fingerprint,
      });
    }
  }
  return candidates;
}

export async function captureHistory(workspace: string, input: HistoryCaptureInput): Promise<{
  record: CanonicalRecord;
  event: CanonicalRecord;
  created: boolean;
}> {
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const fingerprint = String(input.metadata?.source_fingerprint ?? sha256(JSON.stringify({ title: input.title, summary: input.summary, occurredAt })));
  const id = deterministicId("history", fingerprint, input.title);
  let record: CanonicalRecord;
  let created = false;
  try {
    record = await readRecord(workspace, id);
  } catch (error) {
    if (!(error instanceof AutoTinkerError) || error.code !== "RECORD_NOT_FOUND") throw error;
    record = await createRecord(workspace, "history", {
      id,
      title: input.title,
      status: "captured",
      privacy: "private",
      confidence: 0.8,
      tags: input.tags ?? [],
      source_refs: input.source_refs ?? [],
      body: input.summary,
      metadata: { ...input.metadata, occurred_at: occurredAt, source_fingerprint: fingerprint },
    });
    created = true;
  }
  // Event identity must come from the durable history record, not from the
  // wall clock or caller fields of this particular capture attempt. Imports
  // without a source timestamp otherwise create a fresh event every time even
  // though their source fingerprint resolves to the same history record.
  const stableOccurredAt =
    typeof record.frontmatter.occurred_at === "string"
      ? record.frontmatter.occurred_at
      : record.frontmatter.created_at;
  const eventResult = await appendEvent(workspace, {
    title: `Captured history: ${record.frontmatter.title}`,
    event_kind: "history-captured",
    occurred_at: stableOccurredAt,
    privacy: "private",
    tags: ["history", ...record.frontmatter.tags],
    links: [record.frontmatter.id],
    source_refs: record.frontmatter.source_refs,
    body: `History record: [[${record.frontmatter.id}]]`,
  });
  return { record, event: eventResult.record, created };
}

export async function importHistory(
  workspace: string,
  input: string,
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<{ scanned_files: number; candidates: number; created: number; deduplicated: number; records: CanonicalRecord[] }> {
  const files = await sourceFiles(path.resolve(input));
  const raw = (await Promise.all(files.map(candidatesFromFile))).flat();
  const unique = [...new Map(raw.map((candidate) => [candidate.source_fingerprint, candidate])).values()].slice(0, options.limit ?? 1000);
  if (options.dryRun) return { scanned_files: files.length, candidates: unique.length, created: 0, deduplicated: raw.length - unique.length, records: [] };
  const records: CanonicalRecord[] = [];
  let created = 0;
  for (const candidate of unique) {
    const result = await captureHistory(workspace, {
      ...candidate,
      metadata: { ...candidate.metadata, source_fingerprint: candidate.source_fingerprint },
    });
    records.push(result.record);
    if (result.created) created += 1;
  }
  return {
    scanned_files: files.length,
    candidates: unique.length,
    created,
    deduplicated: raw.length - unique.length + (unique.length - created),
    records,
  };
}

export async function reconcileHistory(workspace: string): Promise<{
  scanned: number;
  canonical: number;
  duplicates_marked: number;
}> {
  const history = (await readAllRecords(workspace)).filter((record) => record.frontmatter.type === "history");
  const byFingerprint = new Map<string, CanonicalRecord>();
  let duplicates = 0;
  for (const record of history.sort((a, b) => a.frontmatter.created_at.localeCompare(b.frontmatter.created_at))) {
    const fingerprint = String(record.frontmatter.source_fingerprint ?? sha256(`${record.frontmatter.title}\0${record.body}`));
    const canonical = byFingerprint.get(fingerprint);
    if (!canonical) {
      byFingerprint.set(fingerprint, record);
      continue;
    }
    if (record.frontmatter.status !== "duplicate" || record.frontmatter.supersedes !== canonical.frontmatter.id) {
      await updateRecord(workspace, record.frontmatter.id, {
        status: "duplicate",
        links: [...record.frontmatter.links, canonical.frontmatter.id],
        metadata: { supersedes: canonical.frontmatter.id, source_fingerprint: fingerprint },
      });
      duplicates += 1;
    }
  }
  await appendEvent(workspace, {
    title: "History reconciliation",
    event_kind: "history-reconciled",
    occurred_at: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    privacy: "private",
    body: `Scanned ${history.length} history records; ${duplicates} newly marked duplicate.`,
    metadata: { scanned: history.length, canonical: byFingerprint.size, duplicates_marked: duplicates },
  });
  return { scanned: history.length, canonical: byFingerprint.size, duplicates_marked: duplicates };
}
