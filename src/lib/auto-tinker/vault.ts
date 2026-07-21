import { readdir } from "node:fs/promises";
import path from "node:path";
import { deterministicId, sha256, stableRecordId } from "./ids";
import { pathExists, readMarkdownRecord, writeMarkdownRecord } from "./markdown";
import { sanitizeUnknown } from "./security";
import {
  AutoTinkerError,
  AUTOMATION_MODES,
  RECORD_TYPES,
  type AutoTinkerSettings,
  type CanonicalRecord,
  type CreateRecordInput,
  type Privacy,
  type RecordFrontmatter,
  type RecordPatch,
  type RecordType,
  type ValidationIssue,
} from "./types";

const TYPE_DIRECTORIES: Record<RecordType, string> = {
  config: "",
  profile: "profiles",
  goal: "goals",
  device: "devices",
  machine: "machines",
  history: "history",
  event: "events",
  opportunity: "opportunities",
  "queue-item": "queue",
  experiment: "experiments",
  lesson: "lessons",
  journal: "journals",
  source: "sources",
};

const RESERVED_KEYS = new Set([
  "id",
  "type",
  "title",
  "status",
  "created_at",
  "updated_at",
  "privacy",
  "confidence",
  "tags",
  "links",
  "source_refs",
  "body",
  "path",
]);

export function vaultRoot(workspace: string): string {
  return path.join(path.resolve(workspace), ".auto-tinker");
}

export function recordPath(workspace: string, type: RecordType, id: string): string {
  if (type === "config") return path.join(vaultRoot(workspace), "config.md");
  if (type === "goal" && id === "goal-main") return path.join(vaultRoot(workspace), "goals", "main.md");
  return path.join(vaultRoot(workspace), TYPE_DIRECTORIES[type], `${id}.md`);
}

function normalizeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function normalizePrivacy(value: unknown): Privacy {
  if (value === "private" || value === "review" || value === "public") return value;
  return "private";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateRecord(record: CanonicalRecord): ValidationIssue[] {
  const fm = record.frontmatter;
  const issues: ValidationIssue[] = [];
  if (!fm || typeof fm !== "object") return [{ path: record.path, message: "Frontmatter must be an object" }];
  if (typeof fm.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,180}$/.test(fm.id)) {
    issues.push({ path: record.path, field: "id", message: "ID must be a safe, stable lowercase identifier" });
  }
  if (!RECORD_TYPES.includes(fm.type)) issues.push({ path: record.path, field: "type", message: "Unknown record type" });
  if (typeof fm.title !== "string" || !fm.title.trim()) issues.push({ path: record.path, field: "title", message: "Title is required" });
  if (typeof fm.status !== "string" || !fm.status.trim()) issues.push({ path: record.path, field: "status", message: "Status is required" });
  if (!isIsoDate(fm.created_at)) issues.push({ path: record.path, field: "created_at", message: "created_at must be ISO-8601" });
  if (!isIsoDate(fm.updated_at)) issues.push({ path: record.path, field: "updated_at", message: "updated_at must be ISO-8601" });
  if (!(["private", "review", "public"] as unknown[]).includes(fm.privacy)) {
    issues.push({ path: record.path, field: "privacy", message: "privacy must be private, review, or public" });
  }
  if (typeof fm.confidence !== "number" || fm.confidence < 0 || fm.confidence > 1) {
    issues.push({ path: record.path, field: "confidence", message: "confidence must be between 0 and 1" });
  }
  for (const field of ["tags", "links", "source_refs"] as const) {
    if (!Array.isArray(fm[field]) || fm[field].some((value) => typeof value !== "string")) {
      issues.push({ path: record.path, field, message: `${field} must be an array of strings` });
    }
  }
  if (typeof record.body !== "string") issues.push({ path: record.path, field: "body", message: "Body must be Markdown text" });
  return issues;
}

function assertValidRecord(record: CanonicalRecord): void {
  const issues = validateRecord(record);
  if (issues.length) throw new AutoTinkerError("INVALID_RECORD", `Invalid ${record.frontmatter.type ?? "unknown"} record`, issues);
}

function cleanMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (!RESERVED_KEYS.has(key) && value !== undefined) clean[key] = sanitizeUnknown(value);
  }
  return clean;
}

export async function createRecord(
  workspace: string,
  type: RecordType,
  input: CreateRecordInput,
): Promise<CanonicalRecord> {
  const now = new Date().toISOString();
  const title = sanitizeUnknown(input.title.trim());
  const id = input.id ?? stableRecordId(type, title, input.stable_seed);
  const frontmatter = {
    id,
    type,
    title,
    status: input.status?.trim() || "active",
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? input.created_at ?? now,
    privacy: normalizePrivacy(input.privacy),
    confidence: input.confidence ?? 1,
    tags: normalizeStrings(sanitizeUnknown(input.tags ?? [])),
    links: normalizeStrings(sanitizeUnknown(input.links ?? [])),
    source_refs: normalizeStrings(sanitizeUnknown(input.source_refs ?? [])),
    ...cleanMetadata(input.metadata),
  } as RecordFrontmatter;
  const target = recordPath(workspace, type, id);
  if (await pathExists(target)) throw new AutoTinkerError("RECORD_EXISTS", `Record ${id} already exists`, { id, path: target });
  const record: CanonicalRecord = { frontmatter, body: sanitizeUnknown(input.body ?? ""), path: target };
  assertValidRecord(record);
  return writeMarkdownRecord(target, record);
}

export async function listRecordFiles(workspace: string): Promise<string[]> {
  const vault = vaultRoot(workspace);
  const files: string[] = [];
  const config = path.join(vault, "config.md");
  if (await pathExists(config)) files.push(config);
  for (const type of RECORD_TYPES) {
    const directory = TYPE_DIRECTORIES[type];
    if (!directory) continue;
    const full = path.join(vault, directory);
    const entries = await readdir(full, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(full, entry.name));
  }
  return files.sort();
}

export async function readAllRecords(workspace: string): Promise<CanonicalRecord[]> {
  const records: CanonicalRecord[] = [];
  for (const file of await listRecordFiles(workspace)) {
    const record = await readMarkdownRecord(file);
    assertValidRecord(record);
    records.push(record);
  }
  return records.sort((a, b) => a.frontmatter.id.localeCompare(b.frontmatter.id));
}

export async function readRecord(workspace: string, id: string): Promise<CanonicalRecord> {
  if (!/^[a-z0-9][a-z0-9._-]{1,180}$/.test(id)) throw new AutoTinkerError("INVALID_ID", `Unsafe record ID: ${id}`);
  if (id === "config-main") {
    const config = await readMarkdownRecord(recordPath(workspace, "config", id));
    assertValidRecord(config);
    return config;
  }
  for (const type of RECORD_TYPES) {
    if (type === "config") continue;
    const candidate = recordPath(workspace, type, id);
    if (await pathExists(candidate)) {
      const record = await readMarkdownRecord(candidate);
      if (record.frontmatter.id === id) {
        assertValidRecord(record);
        return record;
      }
    }
  }
  // The active main goal always lives at goals/main.md while keeping its own
  // stable ID, so a switch can move records without changing identity.
  for (const file of await listRecordFiles(workspace)) {
    const record = await readMarkdownRecord(file);
    if (record.frontmatter.id === id) {
      assertValidRecord(record);
      return record;
    }
  }
  throw new AutoTinkerError("RECORD_NOT_FOUND", `Record ${id} was not found`, { id });
}

export async function updateRecord(workspace: string, id: string, patch: RecordPatch): Promise<CanonicalRecord> {
  const current = await readRecord(workspace, id);
  if (current.frontmatter.type === "event") {
    throw new AutoTinkerError("APPEND_ONLY", "Event records are append-only. Create a correction with a supersedes link.");
  }
  const metadata = cleanMetadata(patch.metadata);
  const next: CanonicalRecord = {
    frontmatter: {
      ...current.frontmatter,
      ...metadata,
      ...(patch.title !== undefined ? { title: sanitizeUnknown(patch.title.trim()) } : {}),
      ...(patch.status !== undefined ? { status: sanitizeUnknown(patch.status.trim()) } : {}),
      ...(patch.privacy !== undefined ? { privacy: normalizePrivacy(patch.privacy) } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeStrings(sanitizeUnknown(patch.tags)) } : {}),
      ...(patch.links !== undefined ? { links: normalizeStrings(sanitizeUnknown(patch.links)) } : {}),
      ...(patch.source_refs !== undefined ? { source_refs: normalizeStrings(sanitizeUnknown(patch.source_refs)) } : {}),
      id: current.frontmatter.id,
      type: current.frontmatter.type,
      created_at: current.frontmatter.created_at,
      updated_at: new Date().toISOString(),
    },
    body: patch.body !== undefined ? sanitizeUnknown(patch.body) : current.body,
    path: current.path,
  };
  assertValidRecord(next);
  return writeMarkdownRecord(current.path!, next);
}

export async function appendEvent(
  workspace: string,
  input: CreateRecordInput & { event_kind: string; occurred_at?: string; supersedes?: string },
): Promise<{ record: CanonicalRecord; created: boolean }> {
  const fingerprint = sha256(
    JSON.stringify({
      kind: input.event_kind,
      occurred_at: input.occurred_at ?? input.created_at ?? "",
      source_refs: normalizeStrings(input.source_refs ?? []),
      title: input.title.trim(),
      body: sanitizeUnknown(input.body ?? "").trim(),
    }),
  );
  const id = deterministicId("event", fingerprint, input.event_kind);
  try {
    return { record: await readRecord(workspace, id), created: false };
  } catch (error) {
    if (!(error instanceof AutoTinkerError) || error.code !== "RECORD_NOT_FOUND") throw error;
  }
  const links = [...(input.links ?? []), ...(input.supersedes ? [input.supersedes] : [])];
  const record = await createRecord(workspace, "event", {
    ...input,
    id,
    links,
    stable_seed: undefined,
    metadata: {
      ...input.metadata,
      event_kind: input.event_kind,
      occurred_at: input.occurred_at ?? input.created_at ?? new Date().toISOString(),
      fingerprint,
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    },
  });
  return { record, created: true };
}

const LOCAL_METADATA_FIELDS = new Set([
  "starred",
  "priority",
  "rank",
  "scheduled_for",
  "blocked_reason",
  "goal",
  "reviewed_at",
  "repository_publication_approval",
  "repository_publication_approved_at",
  "public_story_review",
  "public_story_reviewed_at",
  "readme_review",
  "readme_reviewed_at",
  "writing_approval",
  "writing_approved_at",
  "output_kind",
]);

export async function updateLocalMetadata(
  workspace: string,
  id: string,
  patch: Record<string, unknown> & Pick<RecordPatch, "title" | "status" | "privacy" | "confidence" | "tags">,
): Promise<CanonicalRecord> {
  const current = await readRecord(workspace, id);
  if (patch.privacy === "public") {
    throw new AutoTinkerError("PUBLICATION_REQUIRED", "The viewer cannot mark content public. Use the publish workflow.");
  }
  if (patch.repository_publication_approval !== undefined && current.frontmatter.type !== "experiment") {
    throw new AutoTinkerError("INVALID_APPROVAL_TARGET", "Repository publication approval is valid only on experiment records");
  }
  if (patch.public_story_review !== undefined) {
    const outputs = Array.isArray(current.frontmatter.linked_outputs)
      ? (current.frontmatter.linked_outputs as Array<{ kind?: string; record_id?: string }>)
      : [];
    if (current.frontmatter.type !== "experiment" || !outputs.some((output) => output.kind === "public-story" && output.record_id)) {
      throw new AutoTinkerError("INVALID_APPROVAL_TARGET", "Public-story review requires an experiment with a linked public-story output");
    }
  }
  if (patch.readme_review !== undefined) {
    const outputs = Array.isArray(current.frontmatter.linked_outputs)
      ? (current.frontmatter.linked_outputs as Array<{ kind?: string; record_id?: string }>)
      : [];
    if (current.frontmatter.type !== "experiment" || !outputs.some((output) => output.kind === "readme" && output.record_id)) {
      throw new AutoTinkerError("INVALID_APPROVAL_TARGET", "README review requires an experiment with a linked README output");
    }
  }
  if (patch.writing_approval !== undefined && (current.frontmatter.type !== "journal" || current.frontmatter.output_kind === "private-journal")) {
    throw new AutoTinkerError("INVALID_APPROVAL_TARGET", "Writing approval is valid only on non-private linked outputs");
  }
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) if (LOCAL_METADATA_FIELDS.has(key)) metadata[key] = value;
  for (const [field, timestampField] of [
    ["repository_publication_approval", "repository_publication_approved_at"],
    ["public_story_review", "public_story_reviewed_at"],
    ["readme_review", "readme_reviewed_at"],
    ["writing_approval", "writing_approved_at"],
  ] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value !== "approved" && value !== "pending") {
      throw new AutoTinkerError("INVALID_APPROVAL", `${field} must be approved or pending`);
    }
    metadata[field] = value;
    const supplied = patch[timestampField];
    metadata[timestampField] =
      value === "approved"
        ? typeof supplied === "string" && !Number.isNaN(Date.parse(supplied))
          ? supplied
          : new Date().toISOString()
        : null;
  }
  return updateRecord(workspace, id, {
    title: patch.title,
    status: patch.status,
    privacy: patch.privacy,
    confidence: patch.confidence,
    tags: patch.tags,
    metadata,
  });
}

export async function readConfig(workspace: string): Promise<CanonicalRecord & { frontmatter: RecordFrontmatter & AutoTinkerSettings }> {
  const config = await readRecord(workspace, "config-main");
  if (config.frontmatter.type !== "config") throw new AutoTinkerError("INVALID_CONFIG", "config.md is not a config record");
  return config as CanonicalRecord & { frontmatter: RecordFrontmatter & AutoTinkerSettings };
}

export async function updateConfig(workspace: string, settings: Partial<AutoTinkerSettings>): Promise<CanonicalRecord> {
  if (settings.preferred_agent !== undefined) {
    if (typeof settings.preferred_agent !== "string") {
      throw new AutoTinkerError("INVALID_CONFIG", "preferred_agent must be a string");
    }
    const agent = settings.preferred_agent.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(agent)) {
      throw new AutoTinkerError("INVALID_CONFIG", "preferred_agent must be a safe agent ID such as codex or chatgpt");
    }
    settings = { ...settings, preferred_agent: agent };
  }
  if (
    settings.max_concurrent !== undefined &&
    (!Number.isInteger(settings.max_concurrent) || settings.max_concurrent < 1 || settings.max_concurrent > 16)
  ) {
    throw new AutoTinkerError("INVALID_CONFIG", "max_concurrent must be an integer from 1 to 16");
  }
  if (settings.automation_mode !== undefined && !AUTOMATION_MODES.includes(settings.automation_mode)) {
    throw new AutoTinkerError("INVALID_CONFIG", `automation_mode must be one of: ${AUTOMATION_MODES.join(", ")}`);
  }
  if (
    settings.time_budget_minutes !== undefined &&
    (!Number.isInteger(settings.time_budget_minutes) || settings.time_budget_minutes < 1 || settings.time_budget_minutes > 1_440)
  ) {
    throw new AutoTinkerError("INVALID_CONFIG", "time_budget_minutes must be an integer from 1 to 1440");
  }
  if (settings.discovery_sources !== undefined) {
    if (!Array.isArray(settings.discovery_sources) || settings.discovery_sources.some((value) => typeof value !== "string")) {
      throw new AutoTinkerError("INVALID_CONFIG", "discovery_sources must be a list of source IDs or aliases");
    }
    const values = settings.discovery_sources.map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (
      values.length !== settings.discovery_sources.length ||
      values.some((value) => !/^[a-z0-9][a-z0-9._-]{0,180}$/.test(value))
    ) {
      throw new AutoTinkerError(
        "INVALID_CONFIG",
        "discovery_sources must contain safe source record IDs or built-in aliases",
      );
    }
    settings = { ...settings, discovery_sources: [...new Set(values)] };
  }
  const allowed: Record<string, unknown> = {};
  for (const key of [
    "auto_public",
    "experiments_per_day",
    "preferred_agent",
    "max_concurrent",
    "automation_mode",
    "time_budget_minutes",
    "interests",
    "goals",
    "constraints",
    "languages",
    "discovery_sources",
  ] as const) {
    if (settings[key] !== undefined) allowed[key] = settings[key];
  }
  allowed.default_privacy = "private";
  return updateRecord(workspace, "config-main", { metadata: allowed });
}

export async function upsertNamedRecord(
  workspace: string,
  type: RecordType,
  id: string,
  input: CreateRecordInput,
): Promise<CanonicalRecord> {
  try {
    return await updateRecord(workspace, id, {
      title: input.title,
      status: input.status,
      privacy: input.privacy,
      confidence: input.confidence,
      tags: input.tags,
      links: input.links,
      source_refs: input.source_refs,
      body: input.body,
      metadata: input.metadata,
    });
  } catch (error) {
    if (!(error instanceof AutoTinkerError) || error.code !== "RECORD_NOT_FOUND") throw error;
    return createRecord(workspace, type, { ...input, id });
  }
}
