import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { sanitizeUnknown } from "./security";
import { AutoTinkerError, type CanonicalRecord, type RecordFrontmatter } from "./types";

const CANONICAL_KEYS = [
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
] as const;

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
}

export async function atomicWriteFile(filePath: string, contents: string | Uint8Array, mode = 0o600): Promise<void> {
  await ensurePrivateDirectory(path.dirname(filePath));
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function orderedFrontmatter(frontmatter: RecordFrontmatter): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of CANONICAL_KEYS) ordered[key] = frontmatter[key];
  for (const key of Object.keys(frontmatter).sort()) {
    if (!CANONICAL_KEYS.includes(key as (typeof CANONICAL_KEYS)[number]) && frontmatter[key] !== undefined) {
      ordered[key] = frontmatter[key];
    }
  }
  return ordered;
}

export function serializeRecord(record: CanonicalRecord): string {
  const safeFrontmatter = sanitizeUnknown(orderedFrontmatter(record.frontmatter));
  const safeBody = sanitizeUnknown(record.body).trimEnd();
  const yaml = YAML.stringify(safeFrontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${safeBody ? `\n${safeBody}\n` : ""}`;
}

export function parseRecord(contents: string, filePath?: string): CanonicalRecord {
  const normalized = contents.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(normalized);
  if (!match) {
    throw new AutoTinkerError("INVALID_MARKDOWN", `Missing YAML frontmatter${filePath ? ` in ${filePath}` : ""}`);
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(match[1]);
  } catch (error) {
    throw new AutoTinkerError("INVALID_YAML", `Could not parse YAML${filePath ? ` in ${filePath}` : ""}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AutoTinkerError("INVALID_FRONTMATTER", `Frontmatter must be a mapping${filePath ? ` in ${filePath}` : ""}`);
  }
  return {
    frontmatter: parsed as RecordFrontmatter,
    body: match[2].replace(/^\r?\n/, "").trimEnd(),
    path: filePath,
  };
}

export async function readMarkdownRecord(filePath: string): Promise<CanonicalRecord> {
  return parseRecord(await readFile(filePath, "utf8"), filePath);
}

export async function writeMarkdownRecord(filePath: string, record: CanonicalRecord): Promise<CanonicalRecord> {
  const written = { ...record, path: filePath };
  await atomicWriteFile(filePath, serializeRecord(written));
  return written;
}
