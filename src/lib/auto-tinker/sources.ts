import { deterministicId } from "./ids";
import { findPotentialSecrets } from "./security";
import { createRecord, readAllRecords, readRecord, updateRecord } from "./vault";
import { AutoTinkerError, type CanonicalRecord } from "./types";

export const SOURCE_CADENCES = ["manual", "hourly", "daily", "weekly", "monthly"] as const;
export type SourceCadence = (typeof SOURCE_CADENCES)[number];

export interface DiscoverySourceInput {
  title: string;
  kind: string;
  /** Web URL or safe local alias such as local://codex-history. */
  url?: string;
  locator?: string;
  enabled?: boolean;
  topics?: string[];
  languages?: string[];
  cadence?: SourceCadence;
  /** Relative ranking influence. 1 is neutral; 0 disables ranking influence. */
  weight?: number;
  /** Deterministic query patterns or collection techniques for this source. */
  techniques?: string[];
  strengths?: string[];
  rate_limit_notes?: string;
  trust_notes?: string;
  retrieved_at?: string;
}

export type DiscoverySourcePatch = Partial<DiscoverySourceInput>;

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function sourceKind(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(normalized)) {
    throw new AutoTinkerError(
      "INVALID_SOURCE",
      "Source kind must be a lowercase slug such as github-search, rss, or package-registry",
    );
  }
  return normalized;
}

function sourceLocator(value: string, kind: string): string {
  const trimmed = value.trim();
  if (kind.startsWith("local-")) {
    const match = /^local:(?:\/\/)?([a-z0-9][a-z0-9._-]{0,63})$/i.exec(trimmed);
    if (!match || match[1] === "." || match[1] === ".." || findPotentialSecrets(trimmed).length) {
      throw new AutoTinkerError(
        "INVALID_SOURCE",
        "Local sources require a non-secret alias such as local://codex-history; paths are not allowed",
      );
    }
    return `local://${match[1].toLowerCase()}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AutoTinkerError("INVALID_SOURCE", "Source URL must be an absolute http or https URL");
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new AutoTinkerError("INVALID_SOURCE", "Source URL must be credential-free http or https");
  }
  if (findPotentialSecrets(parsed.toString()).length) {
    throw new AutoTinkerError("INVALID_SOURCE", "Source URL appears to contain a credential or signed token");
  }
  parsed.hash = "";
  const sortedQuery = [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  parsed.search = "";
  for (const [key, entryValue] of sortedQuery) parsed.searchParams.append(key, entryValue);
  return parsed.toString();
}

async function assertUniqueLocator(workspace: string, locator: string, exceptId?: string): Promise<void> {
  const sources = (await readAllRecords(workspace)).filter((record) => record.frontmatter.type === "source");
  for (const source of sources) {
    if (source.frontmatter.id === exceptId) continue;
    const existingValue = String(source.frontmatter.locator ?? source.frontmatter.url ?? "").trim();
    if (!existingValue) continue;
    let existingLocator = existingValue;
    try {
      existingLocator = sourceLocator(existingValue, String(source.frontmatter.source_kind ?? "web"));
    } catch {
      // Legacy malformed source records still participate in exact-match uniqueness checks.
    }
    if (existingLocator === locator) {
      throw new AutoTinkerError(
        "SOURCE_LOCATOR_EXISTS",
        `Discovery source locator is already owned by ${source.frontmatter.id}`,
      );
    }
  }
}

function inputLocator(input: Pick<DiscoverySourceInput, "url" | "locator">): string {
  const supplied = [input.url, input.locator].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (supplied.length !== 1) {
    throw new AutoTinkerError("INVALID_SOURCE", "Supply exactly one source URL or locator");
  }
  return supplied[0];
}

function sourceCadence(value: string | undefined): SourceCadence {
  const cadence = value ?? "weekly";
  if (!SOURCE_CADENCES.includes(cadence as SourceCadence)) {
    throw new AutoTinkerError("INVALID_SOURCE", `Unsupported source cadence: ${cadence}`);
  }
  return cadence as SourceCadence;
}

function retrievedAt(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new AutoTinkerError("INVALID_SOURCE", "retrieved-at must be an ISO-8601 date or timestamp");
  }
  return date.toISOString();
}

function sourceWeight(value: number | undefined): number {
  const weight = value ?? 1;
  if (!Number.isFinite(weight) || weight < 0 || weight > 2) {
    throw new AutoTinkerError("INVALID_SOURCE", "Source weight must be between 0 and 2");
  }
  return weight;
}

function sourceTags(kind: string, topics: string[], languages: string[]): string[] {
  return uniqueStrings([`source:${kind}`, ...topics, ...languages.map((language) => `language:${language}`)]);
}

export async function addDiscoverySource(workspace: string, input: DiscoverySourceInput): Promise<CanonicalRecord> {
  const title = input.title.trim();
  if (!title) throw new AutoTinkerError("INVALID_SOURCE", "Source title is required");
  const kind = sourceKind(input.kind);
  const locator = sourceLocator(inputLocator(input), kind);
  await assertUniqueLocator(workspace, locator);
  const enabled = input.enabled ?? true;
  const topics = uniqueStrings(input.topics);
  const languages = uniqueStrings(input.languages);
  const cadence = sourceCadence(input.cadence);
  const weight = sourceWeight(input.weight);
  const techniques = uniqueStrings(input.techniques);
  const strengths = uniqueStrings(input.strengths);
  const rate_limit_notes = input.rate_limit_notes?.trim() ?? "";
  const retrieved_at = retrievedAt(input.retrieved_at);
  const trust_notes = input.trust_notes?.trim() ?? "";
  return createRecord(workspace, "source", {
    id: deterministicId("source", locator, "catalog"),
    title,
    status: enabled ? "active" : "disabled",
    privacy: "private",
    confidence: 1,
    tags: sourceTags(kind, topics, languages),
    source_refs: [locator],
    body: trust_notes,
    metadata: {
      source_kind: kind,
      locator,
      ...(locator.startsWith("http") ? { url: locator } : {}),
      enabled,
      topics,
      languages,
      cadence,
      weight,
      techniques,
      strengths,
      rate_limit_notes,
      trust_notes,
      retrieved_at,
    },
  });
}

export async function listDiscoverySources(
  workspace: string,
  filters: { enabled?: boolean; kind?: string } = {},
): Promise<CanonicalRecord[]> {
  const kind = filters.kind === undefined ? undefined : sourceKind(filters.kind);
  return (await readAllRecords(workspace))
    .filter((record) => record.frontmatter.type === "source")
    .filter((record) => filters.enabled === undefined || record.frontmatter.enabled === filters.enabled)
    .filter((record) => kind === undefined || record.frontmatter.source_kind === kind)
    .sort((a, b) => Number(b.frontmatter.enabled === true) - Number(a.frontmatter.enabled === true) || a.frontmatter.title.localeCompare(b.frontmatter.title));
}

export async function updateDiscoverySource(
  workspace: string,
  id: string,
  patch: DiscoverySourcePatch,
): Promise<CanonicalRecord> {
  const current = await readRecord(workspace, id);
  if (current.frontmatter.type !== "source") {
    throw new AutoTinkerError("WRONG_RECORD_TYPE", `${id} is not a discovery source`);
  }
  if (!Object.values(patch).some((value) => value !== undefined)) {
    throw new AutoTinkerError("INVALID_SOURCE", "At least one source field must be supplied");
  }
  const title = patch.title === undefined ? current.frontmatter.title : patch.title.trim();
  if (!title) throw new AutoTinkerError("INVALID_SOURCE", "Source title is required");
  const kind = sourceKind(patch.kind === undefined ? String(current.frontmatter.source_kind) : patch.kind);
  const currentKind = sourceKind(String(current.frontmatter.source_kind));
  const currentLocator = sourceLocator(String(current.frontmatter.locator ?? current.frontmatter.url), currentKind);
  const patchLocator = patch.url !== undefined || patch.locator !== undefined
    ? inputLocator({ url: patch.url, locator: patch.locator })
    : currentLocator;
  const locator = sourceLocator(patchLocator, kind);
  if (locator !== currentLocator) {
    throw new AutoTinkerError(
      "SOURCE_LOCATOR_IMMUTABLE",
      "A discovery source locator is its stable identity; add a new source instead of changing it",
    );
  }
  await assertUniqueLocator(workspace, locator, id);
  const enabled = patch.enabled ?? current.frontmatter.enabled !== false;
  const topics = patch.topics === undefined ? uniqueStrings(current.frontmatter.topics) : uniqueStrings(patch.topics);
  const languages = patch.languages === undefined ? uniqueStrings(current.frontmatter.languages) : uniqueStrings(patch.languages);
  const cadence = patch.cadence === undefined ? sourceCadence(String(current.frontmatter.cadence ?? "weekly")) : sourceCadence(patch.cadence);
  const weight = patch.weight === undefined ? sourceWeight(Number(current.frontmatter.weight ?? 1)) : sourceWeight(patch.weight);
  const techniques = patch.techniques === undefined ? uniqueStrings(current.frontmatter.techniques) : uniqueStrings(patch.techniques);
  const strengths = patch.strengths === undefined ? uniqueStrings(current.frontmatter.strengths) : uniqueStrings(patch.strengths);
  const rate_limit_notes = patch.rate_limit_notes === undefined
    ? String(current.frontmatter.rate_limit_notes ?? "")
    : patch.rate_limit_notes.trim();
  const retrieved_at = patch.retrieved_at === undefined
    ? retrievedAt(String(current.frontmatter.retrieved_at ?? current.frontmatter.updated_at))
    : retrievedAt(patch.retrieved_at);
  const trust_notes = patch.trust_notes === undefined
    ? String(current.frontmatter.trust_notes ?? current.body)
    : patch.trust_notes.trim();
  return updateRecord(workspace, id, {
    title,
    status: enabled ? "active" : "disabled",
    tags: sourceTags(kind, topics, languages),
    source_refs: [locator],
    body: trust_notes,
    metadata: {
      source_kind: kind,
      locator,
      ...(locator.startsWith("http") ? { url: locator } : { url: null }),
      enabled,
      topics,
      languages,
      cadence,
      weight,
      techniques,
      strengths,
      rate_limit_notes,
      trust_notes,
      retrieved_at,
    },
  });
}
