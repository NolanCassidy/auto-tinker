import { chmod, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { edgeId, sha256, slugify } from "./ids";
import { atomicWriteFile, ensurePrivateDirectory } from "./markdown";
import { readAllRecords } from "./vault";
import type {
  ArtifactLocation,
  CanonicalRecord,
  DashboardSnapshot,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  IndexResult,
} from "./types";

async function loadDatabaseSync(): Promise<typeof import("node:sqlite")["DatabaseSync"]> {
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqlite?.DatabaseSync) throw new Error("Auto-Tinker requires Node.js 22 or newer with node:sqlite available");
  return sqlite.DatabaseSync;
}

function countBy(records: CanonicalRecord[], key: "type" | "status" | "privacy"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const value = String(record.frontmatter[key]);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function queueSort(a: CanonicalRecord, b: CanonicalRecord): number {
  return (
    Number(Boolean(b.frontmatter.starred)) - Number(Boolean(a.frontmatter.starred)) ||
    Number(a.frontmatter.priority ?? 100) - Number(b.frontmatter.priority ?? 100) ||
    Number(a.frontmatter.rank ?? 100) - Number(b.frontmatter.rank ?? 100) ||
    a.frontmatter.created_at.localeCompare(b.frontmatter.created_at)
  );
}

export function buildDashboardSnapshot(records: CanonicalRecord[], now = new Date()): DashboardSnapshot {
  const queue = records.filter((record) => record.frontmatter.type === "queue-item").sort(queueSort);
  const next = queue
    .filter((record) => ["queued", "ready", "scheduled"].includes(record.frontmatter.status))
    .filter((record) => !String(record.frontmatter.blocked_reason ?? "").trim())
    .filter((record) => !record.frontmatter.scheduled_for || Date.parse(String(record.frontmatter.scheduled_for)) <= now.getTime())
    .slice(0, 10);
  return {
    generated_at: now.toISOString(),
    counts: {
      total: records.length,
      by_type: countBy(records, "type"),
      by_status: countBy(records, "status"),
      by_privacy: countBy(records, "privacy"),
    },
    queue,
    next,
    pending_review: records
      .filter(
        (record) =>
          record.frontmatter.privacy === "review" ||
          record.frontmatter.repository_publication_approval === "pending" ||
          record.frontmatter.public_story_review === "pending" ||
          record.frontmatter.readme_review === "pending" ||
          record.frontmatter.writing_approval === "pending",
      )
      .sort((a, b) => b.frontmatter.updated_at.localeCompare(a.frontmatter.updated_at)),
    recent: [...records].sort((a, b) => b.frontmatter.updated_at.localeCompare(a.frontmatter.updated_at)).slice(0, 20),
  };
}

export function buildGraphSnapshot(records: CanonicalRecord[], now = new Date()): GraphSnapshot {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const recordIds = new Set(records.map((record) => record.frontmatter.id));

  for (const record of records) {
    nodes.set(record.frontmatter.id, {
      id: record.frontmatter.id,
      kind: "record",
      type: record.frontmatter.type,
      label: record.frontmatter.title,
      status: record.frontmatter.status,
      privacy: record.frontmatter.privacy,
      updated_at: record.frontmatter.updated_at,
      path: record.path,
    });
  }

  for (const record of records) {
    for (const target of record.frontmatter.links) {
      if (!recordIds.has(target) && !nodes.has(target)) {
        nodes.set(target, { id: target, kind: "external", type: "reference", label: target });
      }
      const kind = record.frontmatter.supersedes === target ? "supersedes" : "link";
      const id = edgeId(record.frontmatter.id, target, kind);
      edges.set(id, { id, source: record.frontmatter.id, target, kind });
    }
    for (const tag of record.frontmatter.tags) {
      const target = `tag:${slugify(tag)}`;
      nodes.set(target, { id: target, kind: "tag", type: "tag", label: tag });
      const id = edgeId(record.frontmatter.id, target, "tag");
      edges.set(id, { id, source: record.frontmatter.id, target, kind: "tag" });
    }
    for (const source of record.frontmatter.source_refs) {
      const target = `source:${sha256(source).slice(0, 20)}`;
      nodes.set(target, { id: target, kind: "external", type: "source", label: source });
      const id = edgeId(record.frontmatter.id, target, "source");
      edges.set(id, { id, source: record.frontmatter.id, target, kind: "source" });
    }
    const locations = Array.isArray(record.frontmatter.artifact_locations)
      ? (record.frontmatter.artifact_locations as ArtifactLocation[])
      : [];
    locations.forEach((location, index) => {
      const label = location.label ?? location.uri ?? location.path ?? `${location.kind} location`;
      const target = `artifact:${sha256(`${record.frontmatter.id}\0${location.kind}\0${location.uri ?? ""}\0${location.path ?? ""}\0${index}`).slice(0, 20)}`;
      nodes.set(target, {
        id: target,
        kind: "artifact",
        type: `artifact-${location.kind}`,
        label,
        status: location.availability,
        updated_at: location.last_seen,
      });
      const id = edgeId(record.frontmatter.id, target, "artifact");
      edges.set(id, { id, source: record.frontmatter.id, target, kind: "artifact" });
    });
  }
  return {
    generated_at: now.toISOString(),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function initializeSchema(database: DatabaseSyncType): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      privacy TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      path TEXT NOT NULL,
      body TEXT NOT NULL,
      frontmatter_json TEXT NOT NULL
    );
    CREATE TABLE tags (
      record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (record_id, tag)
    );
    CREATE TABLE links (
      source_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (source_id, target_id, kind)
    );
    CREATE TABLE sources (
      record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      source_ref TEXT NOT NULL,
      PRIMARY KEY (record_id, source_ref)
    );
    CREATE TABLE artifact_locations (
      record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      kind TEXT NOT NULL,
      availability TEXT NOT NULL,
      device_id TEXT,
      uri TEXT,
      path TEXT,
      last_seen TEXT,
      revision TEXT,
      content_hash TEXT,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (record_id, ordinal)
    );
    CREATE INDEX records_type_status ON records(type, status);
    CREATE INDEX records_updated ON records(updated_at DESC);
    CREATE INDEX artifact_availability ON artifact_locations(availability, kind);
  `);
  try {
    database.exec("CREATE VIRTUAL TABLE records_fts USING fts5(id UNINDEXED, title, body, tags)");
  } catch {
    // FTS5 is optional in custom Node builds; canonical/index tables remain usable.
  }
}

export async function rebuildIndex(workspace: string): Promise<IndexResult> {
  const DatabaseSync = await loadDatabaseSync();
  const records = await readAllRecords(workspace);
  const vault = path.join(path.resolve(workspace), ".auto-tinker");
  const cache = path.join(vault, "cache");
  const databasePath = path.join(vault, "index.sqlite");
  const temporary = path.join(vault, `.index.${process.pid}.${crypto.randomUUID()}.sqlite`);
  await ensurePrivateDirectory(vault);
  let database: DatabaseSyncType | undefined;
  let tagCount = 0;
  let linkCount = 0;
  let sourceCount = 0;
  try {
    database = new DatabaseSync(temporary);
    initializeSchema(database);
    const insertRecord = database.prepare(
      "INSERT INTO records (id,type,title,status,privacy,confidence,created_at,updated_at,path,body,frontmatter_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    );
    const insertTag = database.prepare("INSERT INTO tags (record_id,tag) VALUES (?,?)");
    const insertLink = database.prepare("INSERT INTO links (source_id,target_id,kind) VALUES (?,?,?)");
    const insertSource = database.prepare("INSERT INTO sources (record_id,source_ref) VALUES (?,?)");
    const insertLocation = database.prepare(
      "INSERT INTO artifact_locations (record_id,ordinal,kind,availability,device_id,uri,path,last_seen,revision,content_hash,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    );
    let insertFts: ReturnType<DatabaseSyncType["prepare"]> | undefined;
    try {
      insertFts = database.prepare("INSERT INTO records_fts (id,title,body,tags) VALUES (?,?,?,?)");
    } catch {
      insertFts = undefined;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const record of records) {
        const fm = record.frontmatter;
        insertRecord.run(fm.id, fm.type, fm.title, fm.status, fm.privacy, fm.confidence, fm.created_at, fm.updated_at, record.path ?? "", record.body, JSON.stringify(fm));
        for (const tag of fm.tags) {
          insertTag.run(fm.id, tag);
          tagCount += 1;
        }
        for (const target of fm.links) {
          insertLink.run(fm.id, target, fm.supersedes === target ? "supersedes" : "link");
          linkCount += 1;
        }
        for (const source of fm.source_refs) {
          insertSource.run(fm.id, source);
          sourceCount += 1;
        }
        const locations = Array.isArray(fm.artifact_locations) ? (fm.artifact_locations as ArtifactLocation[]) : [];
        locations.forEach((location, ordinal) => {
          insertLocation.run(
            fm.id,
            ordinal,
            location.kind,
            location.availability,
            location.device_id ?? null,
            location.uri ?? null,
            location.path ?? null,
            location.last_seen ?? null,
            location.revision ?? null,
            location.content_hash ?? null,
            JSON.stringify(location),
          );
        });
        insertFts?.run(fm.id, fm.title, record.body, fm.tags.join(" "));
      }
      database.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("built_at", new Date().toISOString());
      database.prepare("INSERT INTO meta (key,value) VALUES (?,?)").run("record_count", String(records.length));
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    database.close();
    database = undefined;
    await chmod(temporary, 0o600);
    await rename(temporary, databasePath);
  } catch (error) {
    database?.close();
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  const generatedAt = new Date();
  const graph = buildGraphSnapshot(records, generatedAt);
  const dashboard = buildDashboardSnapshot(records, generatedAt);
  await ensurePrivateDirectory(cache);
  await atomicWriteFile(path.join(cache, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await atomicWriteFile(path.join(cache, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`);
  return { database: databasePath, records: records.length, tags: tagCount, links: linkCount, sources: sourceCount, graph, dashboard };
}

export async function graphForWorkspace(workspace: string): Promise<GraphSnapshot> {
  return buildGraphSnapshot(await readAllRecords(workspace));
}

export async function dashboardForWorkspace(workspace: string): Promise<DashboardSnapshot> {
  return buildDashboardSnapshot(await readAllRecords(workspace));
}

export async function queryIndex(
  workspace: string,
  options: { type?: string; status?: string; privacy?: string; search?: string; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const DatabaseSync = await loadDatabaseSync();
  const databasePath = path.join(path.resolve(workspace), ".auto-tinker", "index.sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const clauses: string[] = [];
    const parameters: Array<string | number> = [];
    if (options.type) {
      clauses.push("type = ?");
      parameters.push(options.type);
    }
    if (options.status) {
      clauses.push("status = ?");
      parameters.push(options.status);
    }
    if (options.privacy) {
      clauses.push("privacy = ?");
      parameters.push(options.privacy);
    }
    if (options.search) {
      clauses.push("(title LIKE ? OR body LIKE ?)");
      parameters.push(`%${options.search}%`, `%${options.search}%`);
    }
    const sql = `SELECT * FROM records ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
    parameters.push(Math.max(1, Math.min(options.limit ?? 100, 1000)));
    return database.prepare(sql).all(...parameters) as Array<Record<string, unknown>>;
  } finally {
    database.close();
  }
}
