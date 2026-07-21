import { deterministicId } from "./ids";
import { assertOutputPrivacy, mergeArtifactLocations, mergeEvidence, outputPrivacy } from "./artifacts";
import { getMainGoal } from "./goals";
import { currentDeviceId } from "./machine";
import { appendEvent, createRecord, readAllRecords, readConfig, readRecord, updateConfig, updateLocalMetadata, updateRecord, upsertNamedRecord } from "./vault";
import {
  AutoTinkerError,
  type ArtifactLocation,
  type AutoTinkerSettings,
  type CanonicalRecord,
  type EvidenceSnapshot,
  type LinkedOutput,
  type Privacy,
} from "./types";

export interface ProfileUpdate {
  name?: string;
  tone?: string;
  interests?: string[];
  goals?: string[];
  constraints?: string[];
  languages?: string[];
  experiments_per_day?: number;
  auto_public?: boolean;
  preferred_agent?: string;
  max_concurrent?: number;
  discovery_sources?: string[];
  body?: string;
  writing_voice?: Record<string, unknown>;
}

export async function getProfile(workspace: string): Promise<CanonicalRecord> {
  return readRecord(workspace, "profile-main");
}

export async function updateProfile(workspace: string, input: ProfileUpdate): Promise<CanonicalRecord> {
  let current: CanonicalRecord;
  try {
    current = await getProfile(workspace);
  } catch (error) {
    if (!(error instanceof AutoTinkerError) || error.code !== "RECORD_NOT_FOUND") throw error;
    current = await upsertNamedRecord(workspace, "profile", "profile-main", {
      title: input.name ?? "Auto-Tinker user",
      privacy: "private",
      body: input.body ?? "User-owned Auto-Tinker profile.",
    });
  }
  if (
    input.experiments_per_day !== undefined ||
    input.auto_public !== undefined ||
    input.preferred_agent !== undefined ||
    input.max_concurrent !== undefined ||
    input.discovery_sources !== undefined
  ) {
    await updateConfig(workspace, {
      ...(input.experiments_per_day !== undefined ? { experiments_per_day: input.experiments_per_day } : {}),
      ...(input.auto_public !== undefined ? { auto_public: input.auto_public } : {}),
      ...(input.preferred_agent !== undefined ? { preferred_agent: input.preferred_agent } : {}),
      ...(input.max_concurrent !== undefined ? { max_concurrent: input.max_concurrent } : {}),
      ...(input.discovery_sources !== undefined ? { discovery_sources: input.discovery_sources } : {}),
    });
  }
  const voice = input.writing_voice
    ? { ...(current.frontmatter.writing_voice as Record<string, unknown> | undefined), ...input.writing_voice }
    : current.frontmatter.writing_voice;
  return updateRecord(workspace, current.frontmatter.id, {
    title: input.name ?? current.frontmatter.title,
    body: input.body ?? current.body,
    metadata: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
      ...(input.interests !== undefined ? { interests: input.interests } : {}),
      ...(input.goals !== undefined ? { goals: input.goals } : {}),
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      ...(input.languages !== undefined ? { languages: input.languages } : {}),
      ...(voice !== undefined ? { writing_voice: voice } : {}),
      profile_update_source: "explicit-user-input",
    },
  });
}

export interface CandidateInput {
  title: string;
  summary: string;
  source?: string;
  why?: string;
  tags?: string[];
  language?: string;
  repo_url?: string;
  score?: number;
  goal_contribution?: string;
  distraction_risk?: string;
}

export async function addCandidate(workspace: string, input: CandidateInput): Promise<CanonicalRecord> {
  const mainGoal = await getMainGoal(workspace);
  return createRecord(workspace, "opportunity", {
    title: input.title,
    status: "candidate",
    privacy: "private",
    confidence: input.score !== undefined ? Math.max(0, Math.min(1, input.score / 100)) : 0.5,
    tags: input.tags ?? [],
    links: [mainGoal.frontmatter.id],
    source_refs: [input.source, input.repo_url].filter((value): value is string => Boolean(value)),
    body: input.summary,
    metadata: {
      ...(input.source ? { discovery_source: input.source } : {}),
      ...(input.why ? { why_relevant: input.why } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.repo_url ? { repo_url: input.repo_url } : {}),
      ...(input.score !== undefined ? { score: input.score } : {}),
      main_goal_id: mainGoal.frontmatter.id,
      goal_contribution: input.goal_contribution ?? "Not yet assessed",
      distraction_risk: input.distraction_risk ?? "Not yet assessed",
    },
  });
}

export async function evaluateCandidate(
  workspace: string,
  id: string,
  evaluation: {
    score: number;
    fit?: number;
    novelty?: number;
    feasibility?: number;
    impact?: number;
    recommendation?: string;
    notes?: string;
    goal_contribution?: string;
    distraction_risk?: string;
  },
): Promise<CanonicalRecord> {
  const candidate = await readRecord(workspace, id);
  if (candidate.frontmatter.type !== "opportunity") throw new AutoTinkerError("WRONG_RECORD_TYPE", `${id} is not a candidate`);
  return updateRecord(workspace, id, {
    status: evaluation.recommendation === "reject" ? "rejected" : "evaluated",
    confidence: Math.max(0, Math.min(1, evaluation.score / 100)),
    body: evaluation.notes ? `${candidate.body}\n\n## Evaluation\n\n${evaluation.notes}` : candidate.body,
    metadata: {
      score: evaluation.score,
      evaluation: {
        fit: evaluation.fit,
        novelty: evaluation.novelty,
        feasibility: evaluation.feasibility,
        impact: evaluation.impact,
        recommendation: evaluation.recommendation ?? "consider",
      },
      ...(evaluation.goal_contribution ? { goal_contribution: evaluation.goal_contribution } : {}),
      ...(evaluation.distraction_risk ? { distraction_risk: evaluation.distraction_risk } : {}),
      evaluated_at: new Date().toISOString(),
    },
  });
}

export async function discoverCandidates(
  workspace: string,
  options: { status?: string; limit?: number } = {},
): Promise<CanonicalRecord[]> {
  return (await readAllRecords(workspace))
    .filter((record) => record.frontmatter.type === "opportunity")
    .filter((record) => !options.status || record.frontmatter.status === options.status)
    .sort((a, b) => Number(b.frontmatter.score ?? 0) - Number(a.frontmatter.score ?? 0) || b.frontmatter.updated_at.localeCompare(a.frontmatter.updated_at))
    .slice(0, options.limit ?? 100);
}

export interface QueueUpdate {
  starred?: boolean;
  priority?: number;
  rank?: number;
  scheduled_for?: string;
  blocked_reason?: string;
  goal?: string;
  status?: string;
  goal_contribution?: string;
  distraction_risk?: string;
}

async function findQueueItem(workspace: string, targetId: string): Promise<{ item?: CanonicalRecord; target: CanonicalRecord }> {
  const target = await readRecord(workspace, targetId);
  if (target.frontmatter.type === "queue-item") return { item: target, target };
  if (target.frontmatter.type !== "opportunity") {
    throw new AutoTinkerError("WRONG_RECORD_TYPE", `${targetId} is neither a queue item nor candidate`);
  }
  const item = (await readAllRecords(workspace)).find(
    (record) => record.frontmatter.type === "queue-item" && record.frontmatter.candidate_id === targetId,
  );
  return { item, target };
}

export async function updateQueue(workspace: string, targetId: string, patch: QueueUpdate): Promise<CanonicalRecord> {
  const { item, target } = await findQueueItem(workspace, targetId);
  if (!item) {
    return createRecord(workspace, "queue-item", {
      id: deterministicId("queue-item", target.frontmatter.id, target.frontmatter.title),
      title: target.frontmatter.title,
      status: patch.status ?? "queued",
      privacy: "private",
      confidence: target.frontmatter.confidence,
      tags: target.frontmatter.tags,
      links: [target.frontmatter.id, ...target.frontmatter.links],
      body: target.body,
      metadata: {
        candidate_id: target.frontmatter.id,
        starred: patch.starred ?? false,
        priority: patch.priority ?? 100,
        rank: patch.rank ?? 100,
        ...(patch.scheduled_for ? { scheduled_for: patch.scheduled_for } : {}),
        ...(patch.blocked_reason ? { blocked_reason: patch.blocked_reason } : {}),
        ...(patch.goal ? { goal: patch.goal } : {}),
        goal_contribution: patch.goal_contribution ?? target.frontmatter.goal_contribution ?? "Not yet assessed",
        distraction_risk: patch.distraction_risk ?? target.frontmatter.distraction_risk ?? "Not yet assessed",
      },
    });
  }
  return updateRecord(workspace, item.frontmatter.id, {
    status: patch.status ?? item.frontmatter.status,
    metadata: {
      ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.rank !== undefined ? { rank: patch.rank } : {}),
      ...(patch.scheduled_for !== undefined ? { scheduled_for: patch.scheduled_for } : {}),
      ...(patch.blocked_reason !== undefined ? { blocked_reason: patch.blocked_reason } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
      ...(patch.goal_contribution !== undefined ? { goal_contribution: patch.goal_contribution } : {}),
      ...(patch.distraction_risk !== undefined ? { distraction_risk: patch.distraction_risk } : {}),
    },
  });
}

export async function listQueue(workspace: string): Promise<CanonicalRecord[]> {
  return (await readAllRecords(workspace))
    .filter((record) => record.frontmatter.type === "queue-item")
    .sort((a, b) => {
      const star = Number(Boolean(b.frontmatter.starred)) - Number(Boolean(a.frontmatter.starred));
      return star || Number(a.frontmatter.priority ?? 100) - Number(b.frontmatter.priority ?? 100) || Number(a.frontmatter.rank ?? 100) - Number(b.frontmatter.rank ?? 100) || a.frontmatter.created_at.localeCompare(b.frontmatter.created_at);
    });
}

export async function nextQueue(workspace: string, count = 1, now = new Date()): Promise<CanonicalRecord[]> {
  return (await listQueue(workspace))
    .filter((record) => ["queued", "ready", "scheduled"].includes(record.frontmatter.status))
    .filter((record) => !String(record.frontmatter.blocked_reason ?? "").trim())
    .filter((record) => !record.frontmatter.scheduled_for || Date.parse(String(record.frontmatter.scheduled_for)) <= now.getTime())
    .slice(0, count);
}

export interface ExperimentInput {
  title: string;
  goal: string;
  mode?: "scratch" | "adapt";
  candidate_id?: string;
  source_repo?: string;
  repo_name?: string;
  tags?: string[];
  locations?: Array<Partial<ArtifactLocation>>;
}

export async function createExperiment(workspace: string, input: ExperimentInput): Promise<CanonicalRecord> {
  const mainGoal = await getMainGoal(workspace);
  const locations = mergeArtifactLocations([], input.locations ?? [], await currentDeviceId(workspace));
  return createRecord(workspace, "experiment", {
    title: input.title,
    status: "planned",
    privacy: "private",
    confidence: 0.5,
    tags: input.tags ?? [],
    links: [mainGoal.frontmatter.id, ...(input.candidate_id ? [input.candidate_id] : [])],
    source_refs: input.source_repo ? [input.source_repo] : [],
    body: input.goal,
    metadata: {
      goal: input.goal,
      main_goal_id: mainGoal.frontmatter.id,
      mode: input.mode ?? "scratch",
      ...(input.candidate_id ? { candidate_id: input.candidate_id } : {}),
      ...(input.source_repo ? { source_repository: input.source_repo } : {}),
      repo_name: input.repo_name,
      artifact_locations: locations,
      artifact_availability: locations.length ? "tracked" : "unverified",
      evidence: [],
      linked_outputs: [],
      repository_publication_approval: "pending",
      readme_review: "pending",
      public_story_review: "pending",
    },
  });
}

export async function updateExperiment(
  workspace: string,
  id: string,
  patch: {
    status?: string;
    summary?: string;
    repo_path?: string;
    repo_url?: string;
    tests?: string[];
    privacy?: Exclude<Privacy, "public">;
    locations?: Array<Partial<ArtifactLocation>>;
    evidence?: Array<Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">>;
    attribution?: string;
    license_review?: "pending" | "compatible" | "approved" | "blocked";
  },
): Promise<CanonicalRecord> {
  const experiment = await readRecord(workspace, id);
  if (experiment.frontmatter.type !== "experiment") throw new AutoTinkerError("WRONG_RECORD_TYPE", `${id} is not an experiment`);
  const locationAdditions = [...(patch.locations ?? [])];
  const deviceId = await currentDeviceId(workspace);
  if (patch.repo_path) locationAdditions.push({ kind: "local", availability: "present", path: patch.repo_path, device_id: deviceId, last_seen: new Date().toISOString() });
  if (patch.repo_url) locationAdditions.push({ kind: "github", availability: "unverified", repository_role: "destination", uri: patch.repo_url });
  const locations = mergeArtifactLocations(experiment.frontmatter.artifact_locations as ArtifactLocation[] | undefined, locationAdditions, deviceId);
  const evidenceInputs = [
    ...(patch.evidence ?? []),
    ...(patch.tests ?? []).map((summary) => ({ kind: "test" as const, summary, status: "pass" as const })),
  ];
  const evidence = mergeEvidence(experiment.frontmatter.evidence as EvidenceSnapshot[] | undefined, evidenceInputs);
  return updateRecord(workspace, id, {
    status: patch.status,
    privacy: patch.privacy,
    body: patch.summary ? `${experiment.body}\n\n## Update ${new Date().toISOString().slice(0, 10)}\n\n${patch.summary}` : experiment.body,
    metadata: {
      artifact_locations: locations,
      artifact_availability: locations.length ? "tracked" : "unverified",
      evidence,
      ...(patch.repo_path ? { repo_path: patch.repo_path } : {}),
      ...(patch.repo_url ? { repo_url: patch.repo_url } : {}),
      ...(patch.attribution !== undefined ? { attribution: patch.attribution } : {}),
      ...(patch.license_review !== undefined ? { license_review: patch.license_review } : {}),
    },
  });
}

export async function completeExperiment(
  workspace: string,
  id: string,
  summary: string,
  evidence: Array<Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">> = [],
): Promise<CanonicalRecord> {
  const before = await readRecord(workspace, id);
  if (before.frontmatter.type !== "experiment") throw new AutoTinkerError("WRONG_RECORD_TYPE", `${id} is not an experiment`);
  const combinedEvidence = mergeEvidence(before.frontmatter.evidence as EvidenceSnapshot[] | undefined, evidence);
  const hasPassingVerification = combinedEvidence.some(
    (item) => (item.kind === "test" || item.kind === "build") && item.status === "pass",
  );
  if (!hasPassingVerification) {
    throw new AutoTinkerError(
      "VERIFICATION_REQUIRED",
      "An experiment cannot be completed without explicit passing test or build evidence.",
    );
  }
  const completed = await updateExperiment(workspace, id, { status: "complete", summary, privacy: "review", evidence });
  await appendEvent(workspace, {
    title: `Completed experiment: ${completed.frontmatter.title}`,
    event_kind: "experiment-completed",
    privacy: "private",
    links: [id],
    body: summary,
  });
  return updateRecord(workspace, id, { metadata: { completed_at: new Date().toISOString() } });
}

export async function createLesson(
  workspace: string,
  input: { title: string; summary: string; experiment_id?: string; capabilities?: string[]; tags?: string[] },
): Promise<CanonicalRecord> {
  return createRecord(workspace, "lesson", {
    title: input.title,
    status: "learned",
    privacy: "private",
    confidence: 0.8,
    tags: [...(input.tags ?? []), ...(input.capabilities ?? [])],
    links: input.experiment_id ? [input.experiment_id] : [],
    body: input.summary,
    metadata: { capabilities: input.capabilities ?? [], ...(input.experiment_id ? { experiment_id: input.experiment_id } : {}) },
  });
}

export async function appendJournal(
  workspace: string,
  input: {
    title: string;
    body: string;
    date?: string;
    experiment_id?: string;
    tags?: string[];
    kind?: LinkedOutput["kind"];
    privacy?: Privacy;
  },
): Promise<CanonicalRecord> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const kind = input.kind ?? "private-journal";
  const privacy = input.privacy ?? outputPrivacy(kind);
  assertOutputPrivacy(kind, privacy);
  const identity = `${input.experiment_id ?? "workspace"}\0${kind}\0${kind === "private-journal" || kind === "changelog" ? date : "current"}`;
  const id = deterministicId("journal", identity, `${kind}-${input.title}`);
  let journal: CanonicalRecord;
  try {
    const existing = await readRecord(workspace, id);
    journal = await updateRecord(workspace, id, {
      title: input.title,
      privacy,
      tags: [...existing.frontmatter.tags, ...(input.tags ?? []), kind],
      body: `${existing.body}\n\n## ${new Date().toISOString()}\n\n${input.body}`,
      metadata: { output_kind: kind, journal_date: date },
    });
  } catch (error) {
    if (!(error instanceof AutoTinkerError) || error.code !== "RECORD_NOT_FOUND") throw error;
    journal = await createRecord(workspace, "journal", {
      id,
      title: input.title,
      status: kind === "public-story" || kind === "changelog" ? "review" : "draft",
      privacy,
      tags: [...(input.tags ?? []), kind],
      links: input.experiment_id ? [input.experiment_id] : [],
      body: input.body,
      metadata: {
        output_kind: kind,
        journal_date: date,
        ...(kind !== "private-journal" ? { writing_approval: "pending" } : {}),
        ...(input.experiment_id ? { experiment_id: input.experiment_id } : {}),
      },
    });
  }
  if (input.experiment_id) {
    const experiment = await readRecord(workspace, input.experiment_id);
    if (experiment.frontmatter.type !== "experiment") throw new AutoTinkerError("WRONG_RECORD_TYPE", `${input.experiment_id} is not an experiment`);
    const outputs = (experiment.frontmatter.linked_outputs as LinkedOutput[] | undefined) ?? [];
    const nextOutput: LinkedOutput = { kind, record_id: journal.frontmatter.id, privacy, updated_at: journal.frontmatter.updated_at };
    const merged = [...outputs.filter((output) => output.kind !== kind || output.record_id !== journal.frontmatter.id), nextOutput];
    await updateRecord(workspace, input.experiment_id, {
      links: [...experiment.frontmatter.links, journal.frontmatter.id],
      metadata: { linked_outputs: merged },
    });
  }
  return journal;
}

export async function reviewJournalOutput(
  workspace: string,
  id: string,
  state: "pending" | "approved",
): Promise<CanonicalRecord> {
  const output = await readRecord(workspace, id);
  if (output.frontmatter.type !== "journal" || !output.frontmatter.output_kind) {
    throw new AutoTinkerError("WRONG_RECORD_TYPE", `${id} is not a linked writing output`);
  }
  const records = await readAllRecords(workspace);
  const explicitParentId = typeof output.frontmatter.experiment_id === "string"
    ? output.frontmatter.experiment_id
    : undefined;
  const parentIds = new Set(
    records
      .filter((record) => {
        if (record.frontmatter.type !== "experiment") return false;
        if (record.frontmatter.id === explicitParentId) return true;
        const linked = Array.isArray(record.frontmatter.linked_outputs)
          ? (record.frontmatter.linked_outputs as LinkedOutput[])
          : [];
        return linked.some((candidate) => candidate.record_id === id);
      })
      .map((record) => record.frontmatter.id),
  );
  if (explicitParentId && !parentIds.has(explicitParentId)) {
    throw new AutoTinkerError(
      "RECORD_NOT_FOUND",
      `Parent experiment ${explicitParentId} for journal ${id} was not found`,
    );
  }

  const reviewed = await updateLocalMetadata(workspace, id, {
    writing_approval: state,
    status: state === "approved" ? "ready" : "review",
  });
  const kind = reviewed.frontmatter.output_kind as LinkedOutput["kind"];
  for (const parentId of parentIds) {
    const experiment = await readRecord(workspace, parentId);
    const outputs = Array.isArray(experiment.frontmatter.linked_outputs)
      ? (experiment.frontmatter.linked_outputs as LinkedOutput[])
      : [];
    const existing = outputs.find((candidate) => candidate.record_id === id);
    const refreshed: LinkedOutput = {
      ...existing,
      kind,
      record_id: id,
      privacy: reviewed.frontmatter.privacy,
      updated_at: reviewed.frontmatter.updated_at,
    };
    await updateRecord(workspace, parentId, {
      links: [...new Set([...experiment.frontmatter.links, id])],
      metadata: {
        linked_outputs: [
          ...outputs.filter((candidate) => candidate.record_id !== id),
          refreshed,
        ],
      },
    });
  }
  return reviewed;
}

export async function currentSettings(workspace: string): Promise<AutoTinkerSettings> {
  const config = await readConfig(workspace);
  return config.frontmatter;
}
