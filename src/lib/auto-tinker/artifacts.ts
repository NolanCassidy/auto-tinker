import { deterministicId, sha256 } from "./ids";
import { redactSecrets } from "./security";
import { AutoTinkerError, type ArtifactLocation, type EvidenceSnapshot, type LinkedOutput, type Privacy } from "./types";

const LOCATION_KINDS = new Set(["local", "github", "other", "unknown"]);
const AVAILABILITY = new Set(["present", "missing", "unverified"]);
const EVIDENCE_KINDS = new Set(["test", "build", "commit", "file", "screenshot", "note", "other"]);
const OUTPUT_PRIVACY: Record<LinkedOutput["kind"], Privacy> = {
  "private-journal": "private",
  readme: "private",
  changelog: "review",
  "public-story": "review",
};

export function normalizeArtifactLocation(input: Partial<ArtifactLocation>, currentDeviceId?: string): ArtifactLocation {
  const kind = input.kind ?? "unknown";
  const availability = input.availability ?? "unverified";
  if (!LOCATION_KINDS.has(kind)) throw new AutoTinkerError("INVALID_LOCATION", `Unknown artifact location kind: ${kind}`);
  if (!AVAILABILITY.has(availability)) {
    throw new AutoTinkerError("INVALID_LOCATION", `Unknown artifact availability: ${availability}`);
  }
  if (input.last_seen && Number.isNaN(Date.parse(input.last_seen))) {
    throw new AutoTinkerError("INVALID_LOCATION", "last_seen must be an ISO-8601 timestamp");
  }
  const deviceId = kind === "local" ? input.device_id ?? currentDeviceId : input.device_id;
  const localIsForeign = kind === "local" && (!deviceId || (currentDeviceId !== undefined && deviceId !== currentDeviceId));
  return {
    kind,
    availability: localIsForeign ? "unverified" : availability,
    ...(input.repository_role ? { repository_role: input.repository_role } : {}),
    ...(deviceId ? { device_id: deviceId } : {}),
    ...(input.uri ? { uri: redactSecrets(input.uri) } : {}),
    ...(input.path ? { path: input.path } : {}),
    ...(input.last_seen ? { last_seen: input.last_seen } : {}),
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.content_hash ? { content_hash: input.content_hash } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
}

function locationIdentity(location: ArtifactLocation): string {
  // Labels are mutable presentation metadata, not artifact identity. Prefer a
  // concrete path, then a URI, so relabeling the same device-owned checkout or
  // remote updates the existing location instead of creating a graph twin.
  const locator = location.path ? `path:${location.path}` : location.uri ? `uri:${location.uri}` : "unlocated";
  return `${location.kind}\0${location.device_id ?? ""}\0${locator}`;
}

export function mergeArtifactLocations(
  current: ArtifactLocation[] | undefined,
  additions: Array<Partial<ArtifactLocation>>,
  currentDeviceId?: string,
): ArtifactLocation[] {
  const merged = new Map<string, ArtifactLocation>();
  for (const location of [...(current ?? []), ...additions.map((item) => normalizeArtifactLocation(item, currentDeviceId))]) {
    const normalized = normalizeArtifactLocation(location, currentDeviceId);
    merged.set(locationIdentity(normalized), { ...merged.get(locationIdentity(normalized)), ...normalized });
  }
  return [...merged.values()].sort((a, b) => locationIdentity(a).localeCompare(locationIdentity(b)));
}

export function normalizeEvidence(input: Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">): EvidenceSnapshot {
  const kind = input.kind ?? "note";
  if (!EVIDENCE_KINDS.has(kind)) throw new AutoTinkerError("INVALID_EVIDENCE", `Unknown evidence kind: ${kind}`);
  const capturedAt = input.captured_at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(capturedAt))) throw new AutoTinkerError("INVALID_EVIDENCE", "captured_at must be ISO-8601");
  const summary = redactSecrets(input.summary.trim());
  if (!summary) throw new AutoTinkerError("INVALID_EVIDENCE", "Evidence summary is required");
  const seed = JSON.stringify({ kind, capturedAt, summary, source: input.source_ref, revision: input.revision });
  return {
    id: input.id ?? deterministicId("event", sha256(seed), "evidence"),
    captured_at: capturedAt,
    kind,
    summary,
    ...(input.source_ref ? { source_ref: redactSecrets(input.source_ref) } : {}),
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.content_hash ? { content_hash: input.content_hash } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

export function mergeEvidence(
  current: EvidenceSnapshot[] | undefined,
  additions: Array<Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">>,
): EvidenceSnapshot[] {
  const merged = new Map<string, EvidenceSnapshot>();
  for (const evidence of [...(current ?? []), ...additions.map(normalizeEvidence)]) merged.set(evidence.id, normalizeEvidence(evidence));
  return [...merged.values()].sort((a, b) => a.captured_at.localeCompare(b.captured_at) || a.id.localeCompare(b.id));
}

export function outputPrivacy(kind: LinkedOutput["kind"]): Privacy {
  return OUTPUT_PRIVACY[kind];
}

export function assertOutputPrivacy(kind: LinkedOutput["kind"], privacy: Privacy): void {
  const maximum = OUTPUT_PRIVACY[kind];
  if (privacy === "public") {
    throw new AutoTinkerError("PUBLICATION_REQUIRED", "Outputs cannot become public through journal mutation; use publish approval.");
  }
  if (kind === "private-journal" && privacy !== "private") {
    throw new AutoTinkerError("PRIVACY_BOUNDARY", "The candid private journal must remain private.");
  }
  if (maximum === "private" && privacy !== "private") {
    throw new AutoTinkerError("PRIVACY_BOUNDARY", `${kind} content defaults to private until its separate publish workflow.`);
  }
}
