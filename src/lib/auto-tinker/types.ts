export const RECORD_TYPES = [
  "config",
  "profile",
  "goal",
  "device",
  "machine",
  "history",
  "event",
  "opportunity",
  "queue-item",
  "experiment",
  "lesson",
  "journal",
  "source",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];
export type Privacy = "private" | "review" | "public";
export type Scalar = string | number | boolean | null;
export type FrontmatterValue = Scalar | Scalar[] | Record<string, unknown> | Record<string, unknown>[];

export interface RecordFrontmatter {
  id: string;
  type: RecordType;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  privacy: Privacy;
  confidence: number;
  tags: string[];
  links: string[];
  source_refs: string[];
  [key: string]: unknown;
}

export interface CanonicalRecord {
  frontmatter: RecordFrontmatter;
  body: string;
  /** Absolute path when the record was read from or written to disk. */
  path?: string;
}

export interface CreateRecordInput {
  id?: string;
  title: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  privacy?: Privacy;
  confidence?: number;
  tags?: string[];
  links?: string[];
  source_refs?: string[];
  body?: string;
  /** Extra, serializable frontmatter. Reserved canonical keys cannot be replaced. */
  metadata?: Record<string, unknown>;
  /** Produces the same ID for repeated imports of the same logical item. */
  stable_seed?: string;
}

export interface RecordPatch {
  title?: string;
  status?: string;
  privacy?: Privacy;
  confidence?: number;
  tags?: string[];
  links?: string[];
  source_refs?: string[];
  body?: string;
  metadata?: Record<string, unknown>;
}

export type ArtifactLocationKind = "local" | "github" | "other" | "unknown";
export type ArtifactAvailability = "present" | "missing" | "unverified";

/**
 * A durable pointer to code or another artifact. Location is evidence, not
 * identity: the parent experiment record remains valid when every location is
 * missing or unverified.
 */
export interface ArtifactLocation {
  kind: ArtifactLocationKind;
  availability: ArtifactAvailability;
  /** Distinguishes an upstream reference from the experiment-owned destination. */
  repository_role?: "source" | "destination";
  /** Stable, non-secret ID of the device that owns a local path. */
  device_id?: string;
  uri?: string;
  path?: string;
  last_seen?: string;
  revision?: string;
  content_hash?: string;
  label?: string;
}

export interface EvidenceSnapshot {
  id: string;
  captured_at: string;
  kind: "test" | "build" | "commit" | "file" | "screenshot" | "note" | "other";
  summary: string;
  source_ref?: string;
  revision?: string;
  content_hash?: string;
  status?: "pass" | "fail" | "unknown";
}

export interface LinkedOutput {
  kind: "private-journal" | "readme" | "changelog" | "public-story";
  record_id?: string;
  path?: string;
  privacy: Privacy;
  updated_at?: string;
}

export interface WorkspacePaths {
  root: string;
  vault: string;
  config: string;
  index: string;
  cache: string;
  tinkers: string;
  tasks: string;
}

export const AUTOMATION_MODES = [
  "discover-only",
  "prepare-only",
  "execute-local",
  "draft-contribution",
  "create-private-remote",
] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export interface AutoTinkerSettings {
  version: number;
  auto_public: boolean;
  experiments_per_day: number;
  default_privacy: "private";
  preferred_agent: string;
  max_concurrent: number;
  automation_mode: AutomationMode;
  time_budget_minutes: number;
  interests: string[];
  goals: string[];
  constraints: string[];
  languages: string[];
  discovery_sources: string[];
}

export interface ValidationIssue {
  path?: string;
  field?: string;
  message: string;
}

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorResult {
  ok: boolean;
  workspace: string;
  checks: DoctorCheck[];
}

export interface GraphNode {
  id: string;
  kind: "record" | "tag" | "external" | "artifact";
  type: string;
  label: string;
  status?: string;
  privacy?: Privacy;
  updated_at?: string;
  path?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "link" | "tag" | "source" | "supersedes" | "artifact";
}

export interface GraphSnapshot {
  generated_at: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DashboardSnapshot {
  generated_at: string;
  counts: {
    total: number;
    by_type: Record<string, number>;
    by_status: Record<string, number>;
    by_privacy: Record<string, number>;
  };
  queue: CanonicalRecord[];
  next: CanonicalRecord[];
  pending_review: CanonicalRecord[];
  recent: CanonicalRecord[];
}

export interface IndexResult {
  database: string;
  records: number;
  tags: number;
  links: number;
  sources: number;
  graph: GraphSnapshot;
  dashboard: DashboardSnapshot;
}

export interface MachineSnapshot {
  device_id: string;
  device_label: string;
  platform: string;
  release: string;
  architecture: string;
  cpu_model: string;
  physical_hint: number;
  logical_cores: number;
  memory_bytes: number;
  free_memory_bytes: number;
  workspace_free_bytes?: number;
  tools: Record<string, { available: boolean; version?: string }>;
}

export interface RepoPlan {
  experiment_id: string;
  mode: "scratch" | "adapt";
  repository_name: string;
  local_path: string;
  /** Local knowledge-record privacy; this does not request a GitHub visibility. */
  experiment_record_privacy: Privacy;
  /** Every new experiment remote is created private, independent of record review state. */
  creation_visibility: "private";
  remote_visibility: "private" | "public";
  source_repository?: string;
  attribution_required: boolean;
  publication: {
    allowed: boolean;
    reason: string;
    auto_public: boolean;
    reviewed: boolean;
    consent: boolean;
    readiness: Array<{ gate: string; passed: boolean; message: string }>;
  };
  commands: string[][];
}

export interface CommandEnvelope<T = unknown> {
  ok: boolean;
  command: string;
  workspace?: string;
  data?: T;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AutoTinkerError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AutoTinkerError";
    this.code = code;
    this.details = details;
  }
}
