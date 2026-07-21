import "server-only";

import path from "node:path";
import { redactWorkspacePaths, safeUninitializedWorkspaceCandidate } from "@/app/api/_viewer-boundary";
import { assertViewerMutationAllowed } from "@/app/api/_viewer-policy";
import { hasPassingTestEvidence, viewerArtifactAvailability } from "@/app/api/_viewer-projection";
import {
  buildDashboardSnapshot,
  buildGraphSnapshot,
  rebuildIndex,
} from "@/lib/auto-tinker/indexer";
import { generatePrompt } from "@/lib/auto-tinker/prompts";
import { currentDeviceId as resolveCurrentDeviceId } from "@/lib/auto-tinker/machine";
import type {
  ArtifactLocation,
  CanonicalRecord,
  LinkedOutput,
  RecordFrontmatter,
  WorkspacePaths,
} from "@/lib/auto-tinker/types";
import {
  readAllRecords,
  readRecord,
  updateConfig,
  updateLocalMetadata,
} from "@/lib/auto-tinker/vault";
import { resolveWorkspace } from "@/lib/auto-tinker/workspace";
import type {
  Experiment,
  GraphNode,
  InterestItem,
  MainGoal,
  PublicationItem,
  QueueItem,
  QueueStatus,
  RecordPrivacy,
  SourceItem,
  TimelineItem,
  ViewerMutation,
  ViewerSettings,
  ViewerSnapshot,
  WritingSurface,
} from "@/components/viewer-types";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,180}$/;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function privacy(value: unknown): RecordPrivacy {
  return value === "public" || value === "review" ? value : "private";
}

function excerpt(body: string, fallback = "No summary has been written yet.") {
  const clean = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? `${clean.slice(0, 205)}${clean.length > 205 ? "…" : ""}` : fallback;
}

function queueStatus(value: unknown): QueueStatus {
  const normalized = text(value).toLowerCase();
  if (
    normalized === "idea" ||
    normalized === "queued" ||
    normalized === "ready" ||
    normalized === "in_progress" ||
    normalized === "blocked" ||
    normalized === "done" ||
    normalized === "archived"
  ) return normalized;
  if (normalized === "active" || normalized === "running") return "in_progress";
  if (normalized === "complete" || normalized === "completed" || normalized === "learned") return "done";
  if (normalized === "rejected") return "archived";
  return "idea";
}

function distractionRisk(value: unknown): QueueItem["distractionRisk"] {
  const normalized = text(value).toLowerCase();
  if (normalized === "low" || normalized.includes("low risk")) return "low";
  if (normalized === "medium" || normalized.includes("moderate")) return "medium";
  if (normalized === "high" || normalized.includes("distraction") && !normalized.includes("not yet")) return "high";
  return undefined;
}

function queueItem(record: CanonicalRecord, rank: number): QueueItem {
  const fm = record.frontmatter;
  const alignment =
    typeof fm.goal_alignment === "number"
      ? fm.goal_alignment
      : typeof fm.goal_fit === "number"
        ? fm.goal_fit
        : undefined;
  return {
    id: fm.id,
    title: fm.title,
    summary: excerpt(record.body),
    status: queueStatus(fm.status),
    rank: Math.max(1, number(fm.rank, number(fm.priority, rank))),
    starred: boolean(fm.starred),
    reviewed: Boolean(fm.reviewed_at),
    scheduledAt: text(fm.scheduled_for) || null,
    privacy: privacy(fm.privacy),
    tags: fm.tags,
    ...(typeof fm.score === "number" ? { score: fm.score } : {}),
    ...(text(fm.effort || fm.estimated_effort) ? { effort: text(fm.effort || fm.estimated_effort) } : {}),
    ...(text(fm.discovery_source) ? { source: text(fm.discovery_source) } : {}),
    ...(text(fm.goal_contribution || fm.why_relevant) ? { reason: text(fm.goal_contribution || fm.why_relevant) } : {}),
    ...(alignment !== undefined ? { goalAlignment: alignment <= 1 ? alignment * 100 : alignment } : {}),
    ...(distractionRisk(fm.distraction_risk) ? { distractionRisk: distractionRisk(fm.distraction_risk) } : {}),
  };
}

function normalizeLocation(record: CanonicalRecord, currentDeviceId?: string): Experiment["location"] {
  const fm = record.frontmatter;
  const rawLocations = Array.isArray(fm.artifact_locations)
    ? (fm.artifact_locations as Array<ArtifactLocation & { device_id?: string }>)
    : [];
  const locations = rawLocations
    .filter((location) => location && typeof location === "object")
    .map((location) => ({
      ...location,
      availability: viewerArtifactAvailability(location, currentDeviceId),
    }));
  const ranked = [...locations].sort((a, b) => {
    const availability = { present: 0, unverified: 1, missing: 2 };
    const kind = { local: 0, github: 1, other: 2, unknown: 3 };
    return availability[a.availability] - availability[b.availability] || kind[a.kind] - kind[b.kind];
  });
  const selected = ranked[0];
  if (!selected) {
    return { kind: "knowledge-only", status: "unverified", label: "No code location" };
  }
  return {
    kind: selected.kind === "unknown" ? "knowledge-only" : selected.kind,
    status: selected.availability,
    ...(selected.label || selected.path || selected.uri
      ? {
          label: selected.kind === "local" && selected.path
            ? path.basename(selected.path)
            : text(selected.label || selected.uri),
        }
      : {}),
  };
}

function outputSurface(output: LinkedOutput & Record<string, unknown>, fm: RecordFrontmatter): WritingSurface {
  const kind =
    output.kind === "private-journal"
      ? "journal"
      : output.kind === "public-story"
        ? "story"
        : output.kind;
  const previewKey = kind === "story" ? "public_story_preview" : kind === "readme" ? "readme_preview" : "";
  const stateValue = text(output.state);
  const state: WritingSurface["state"] =
    stateValue === "missing" || stateValue === "draft" || stateValue === "ready" || stateValue === "published"
      ? stateValue
      : output.privacy === "public"
        ? "published"
        : output.path || output.record_id
          ? "ready"
          : "draft";
  return {
    kind,
    title:
      kind === "journal"
        ? "Private journal"
        : kind === "readme"
          ? "Rich README"
          : kind === "changelog"
            ? "Dated changelog"
            : "Public story",
    state,
    privacy: privacy(output.privacy),
    ...(output.updated_at ? { updatedAt: output.updated_at } : {}),
    ...(text(output.preview || (previewKey ? fm[previewKey] : undefined))
      ? { preview: text(output.preview || fm[previewKey]).slice(0, 240) }
      : {}),
  };
}

function experiment(record: CanonicalRecord, currentDeviceId?: string): Experiment {
  const fm = record.frontmatter;
  const outputs = Array.isArray(fm.linked_outputs)
    ? (fm.linked_outputs as Array<LinkedOutput & Record<string, unknown>>)
    : [];
  const writing = outputs.map((output) => outputSurface(output, fm));
  const done = ["done", "complete", "completed"].includes(fm.status);
  const testsPassing =
    boolean(fm.tests_passing) ||
    hasPassingTestEvidence(fm.evidence);
  const readmeReady = boolean(fm.readme_ready) || writing.some((surface) => surface.kind === "readme" && surface.state !== "missing");
  const sourceRepository = text(fm.source_repository);
  const attributionReady =
    boolean(fm.attribution_ready) ||
    text(fm.mode) === "scratch" ||
    (!sourceRepository && fm.source_refs.length === 0) ||
    boolean(fm.attribution_complete);
  const reviewed = Boolean(fm.reviewed_at);
  const progress =
    typeof fm.progress === "number"
      ? fm.progress <= 1
        ? fm.progress * 100
        : fm.progress
      : done
        ? 100
        : ["in_progress", "active", "running"].includes(fm.status)
          ? 58
          : 16;
  return {
    id: fm.id,
    title: fm.title,
    summary: excerpt(record.body),
    status: done ? "done" : fm.status,
    privacy: privacy(fm.privacy),
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    ...(text(fm.repo_url || fm.repo_name || fm.repo_path)
      ? {
          repo: text(fm.repo_url || fm.repo_name || (typeof fm.repo_path === "string" ? path.basename(fm.repo_path) : "")),
        }
      : {}),
    location: normalizeLocation(record, currentDeviceId),
    ...(text(fm.language) ? { language: text(fm.language) } : {}),
    updatedAt: fm.updated_at,
    tags: fm.tags,
    testsPassing,
    reviewed,
    readmeReady,
    attributionReady,
    writing,
  };
}

function timelineItem(record: CanonicalRecord): TimelineItem {
  const fm = record.frontmatter;
  const eventKind = text(fm.event_kind).toLowerCase();
  const type: TimelineItem["type"] =
    fm.type === "lesson"
      ? "lesson"
      : fm.type === "journal"
        ? eventKind.includes("change") || text(fm.output_kind).includes("changelog")
          ? "changelog"
          : "journal"
        : eventKind.includes("change")
          ? "changelog"
          : "event";
  return {
    id: fm.id,
    type,
    title: fm.title,
    summary: excerpt(record.body),
    occurredAt: text(fm.occurred_at, fm.updated_at),
    tags: fm.tags,
    ...(text(fm.experiment_id) ? { experimentId: text(fm.experiment_id) } : {}),
  };
}

function sourceItems(records: CanonicalRecord[], config: RecordFrontmatter | undefined): SourceItem[] {
  const recordsByKey = new Map<string, SourceItem>();
  for (const record of records.filter((candidate) => candidate.frontmatter.type === "source")) {
    const fm = record.frontmatter;
    recordsByKey.set(fm.id, {
      id: fm.id,
      title: fm.title,
      kind: text(fm.source_kind || fm.kind, "feed"),
      enabled: fm.enabled !== false && fm.status !== "disabled",
      ...(text(fm.last_checked_at || fm.checked_at || fm.retrieved_at) ? { lastChecked: text(fm.last_checked_at || fm.checked_at || fm.retrieved_at) } : {}),
      ...(record.body ? { detail: excerpt(record.body, "") } : {}),
      ...(typeof fm.weight === "number" ? { weight: fm.weight } : {}),
      ...(strings(fm.techniques).length ? { techniques: strings(fm.techniques) } : {}),
    });
  }
  for (const configured of strings(config?.discovery_sources)) {
    const existing = [...recordsByKey.values()].some(
      (source) => source.id === configured || source.title.toLowerCase() === configured.toLowerCase(),
    );
    if (!existing) recordsByKey.set(`config-${configured}`, { id: `config-${configured}`, title: configured.replaceAll("-", " "), kind: configured, enabled: true });
  }
  return [...recordsByKey.values()].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title));
}

function interestItems(records: CanonicalRecord[], config: RecordFrontmatter | undefined): InterestItem[] {
  const profile = records.find((record) => record.frontmatter.type === "profile")?.frontmatter;
  const explicit = [...new Set([...strings(config?.interests), ...strings(profile?.interests)])];
  const weights = object(profile?.interest_weights);
  return explicit.map((name) => ({
    name,
    weight: Math.max(0, Math.min(100, number(weights[name], 82))),
    evidence: records.filter((record) => record.frontmatter.tags.some((tag) => tag.toLowerCase() === name.toLowerCase())).length,
  })).sort((a, b) => b.weight - a.weight || b.evidence - a.evidence || a.name.localeCompare(b.name));
}

function describeVoice(profile: RecordFrontmatter | undefined) {
  const voice = object(profile?.writing_voice);
  if (Object.keys(voice).length === 0) return undefined;
  const parts = [
    text(voice.directness),
    voice.first_person === false ? "avoids first person" : voice.first_person === true ? "first person" : "",
    text(voice.preferred_detail),
    text(voice.tone),
  ].filter(Boolean);
  return parts.join(", ") || "A user-defined voice is stored in the private profile.";
}

function settingsFor(
  paths: WorkspacePaths,
  records: CanonicalRecord[],
  config: RecordFrontmatter | undefined,
): ViewerSettings {
  const profile = records.find((record) => record.frontmatter.type === "profile")?.frontmatter;
  const machine = records.find((record) => record.frontmatter.type === "machine")?.frontmatter;
  const tools = object(machine?.tools);
  const gh = object(tools.gh);
  return {
    dailyExperimentCount: Math.max(1, number(config?.experiments_per_day, 1)),
    autoPublic: boolean(config?.auto_public),
    preferredLanguages: strings(config?.languages).length ? strings(config?.languages) : strings(profile?.languages),
    maxConcurrent: Math.max(1, number(config?.max_concurrent, 1)),
    preferredAgent: text(config?.preferred_agent, "codex"),
    automationMode: text(config?.automation_mode, "discover-only"),
    timeBudgetMinutes: Math.max(1, number(config?.time_budget_minutes, 60)),
    vaultLabel: path.basename(paths.vault) || ".auto-tinker",
    githubConnected: boolean(config?.github_connected) || boolean(gh.available),
    localOnly: !boolean(config?.sync_enabled),
    ...(describeVoice(profile) ? { writingVoice: describeVoice(profile) } : {}),
  };
}

function mainGoalFor(records: CanonicalRecord[]): MainGoal | null {
  const main = records.find(
    (record) => record.frontmatter.type === "goal" && record.frontmatter.is_main === true && record.frontmatter.status === "active",
  );
  if (!main) return null;
  const fm = main.frontmatter;
  const successCriteria = strings(fm.success_criteria);
  const evidence = strings(fm.progress_evidence || fm.evidence);
  const supportingGoals = records
    .filter((record) => record.frontmatter.type === "goal" && record.frontmatter.is_main !== true && record.frontmatter.status !== "archived")
    .map((record) => record.frontmatter.title);
  const explicitProgress = typeof fm.progress === "number" ? (fm.progress <= 1 ? fm.progress * 100 : fm.progress) : undefined;
  const progress = explicitProgress ?? (successCriteria.length ? Math.min(100, (evidence.length / successCriteria.length) * 100) : 0);
  return {
    id: fm.id,
    title: fm.title,
    outcome: text(fm.outcome, excerpt(main.body)),
    horizon: text(fm.horizon, "No horizon set"),
    progress: Math.max(0, Math.min(100, progress)),
    successCriteria,
    evidence,
    supportingGoals,
  };
}

function publicationFor(item: Experiment, record: CanonicalRecord): PublicationItem {
  const storyReview = record.frontmatter.public_story_review === "approved" ? "approved" : "pending";
  const checks = [item.testsPassing, item.readmeReady, item.attributionReady, storyReview === "approved"];
  const blockers = [
    !item.testsPassing && "verification",
    !item.readmeReady && "README story",
    !item.attributionReady && "attribution",
    storyReview !== "approved" && "public-story draft review",
  ].filter((value): value is string => Boolean(value));
  return {
    id: item.id,
    title: item.title,
    privacy: item.privacy,
    readiness: checks.filter(Boolean).length * 25,
    reviewed: item.reviewed,
    testsPassing: item.testsPassing,
    readmeReady: item.readmeReady,
    attributionReady: item.attributionReady,
    blockers,
    storyReview,
  };
}

async function workspaceForViewer(): Promise<{ paths: WorkspacePaths; initialized: boolean }> {
  try {
    return { paths: await resolveWorkspace(), initialized: true };
  } catch {
    const likelyWorkspace = safeUninitializedWorkspaceCandidate({
      cwd: process.cwd(),
      explicit: process.env.AUTO_TINKER_WORKSPACE,
    });
    if (!likelyWorkspace) {
      throw new Error("The local viewer could not safely infer an Auto-Tinker master workspace");
    }
    return {
      paths: await resolveWorkspace({ explicit: likelyWorkspace, allowUninitialized: true }),
      initialized: false,
    };
  }
}

function viewerSafeLabel(value: string, fallback: string) {
  if (!value) return fallback;
  if (path.isAbsolute(value)) return path.basename(value) || fallback;
  if (value.startsWith("file://")) {
    try {
      return path.basename(new URL(value).pathname) || fallback;
    } catch {
      return fallback;
    }
  }
  return value;
}

export async function getViewerSnapshot(): Promise<ViewerSnapshot> {
  const { paths, initialized } = await workspaceForViewer();
  const records = initialized ? await readAllRecords(paths.root) : [];
  const dashboard = buildDashboardSnapshot(records);
  const graph = buildGraphSnapshot(records);
  const recordsById = new Map(records.map((record) => [record.frontmatter.id, record]));
  const config = records.find((record) => record.frontmatter.type === "config")?.frontmatter;
  const profile = records.find((record) => record.frontmatter.type === "profile")?.frontmatter;
  const localDeviceId = initialized ? await resolveCurrentDeviceId(paths.root) : undefined;
  const currentMachine = records.find(
    (record) =>
      record.frontmatter.type === "machine" &&
      (!localDeviceId || record.frontmatter.device_id === localDeviceId),
  )?.frontmatter;
  const currentDeviceId = localDeviceId || text(currentMachine?.device_id) || undefined;
  const mainGoal = mainGoalFor(records);
  const ownerName = text(profile?.name, profile?.title === "Auto-Tinker user" ? "" : text(profile?.title, "you"));

  const queuedIds = new Set(dashboard.queue.map((record) => text(record.frontmatter.candidate_id)).filter(Boolean));
  const unqueuedCandidates = records.filter(
    (record) => record.frontmatter.type === "opportunity" && !queuedIds.has(record.frontmatter.id) && record.frontmatter.status !== "rejected",
  );
  const queueRecords = [...dashboard.queue, ...unqueuedCandidates];
  const queue = queueRecords.map((record, index) => queueItem(record, index + 1));
  const experimentRecords = records.filter((record) => record.frontmatter.type === "experiment");
  const experiments = experimentRecords
    .map((record) => experiment(record, currentDeviceId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const timeline = records
    .filter((record) => record.frontmatter.type === "lesson" || record.frontmatter.type === "journal" || record.frontmatter.type === "event")
    .map(timelineItem)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const graphNodes: GraphNode[] = graph.nodes.map((node) => {
    const record = recordsById.get(node.id);
    return {
      id: node.id,
      title: viewerSafeLabel(node.label, node.type.replaceAll("-", " ")),
      type: node.type,
      status: text(node.status, "linked"),
      privacy: privacy(node.privacy),
      tags: record?.frontmatter.tags ?? [],
      ...(record ? { summary: excerpt(record.body, "") } : {}),
    };
  });
  const publication = experimentRecords
    .map((record) => publicationFor(experiments.find((item) => item.id === record.frontmatter.id)!, record))
    .filter((item) => item.privacy === "review" || item.privacy === "public" || item.readiness > 0);
  const settings = settingsFor(paths, records, config);
  const warnings: string[] = [];
  if (experiments.some((item) => item.location.status === "missing")) {
    warnings.push("Some code locations are missing on this device. Their knowledge records remain intact and visible.");
  }

  const snapshot: ViewerSnapshot = {
    generatedAt: dashboard.generated_at,
    initialized,
    workspaceName: path.basename(paths.root) || "Auto-Tinker",
    ownerName: ownerName || "you",
    greeting: ownerName && ownerName !== "you" ? `Welcome back, ${ownerName.split(/\s+/)[0]}.` : "Welcome back, tinkerer.",
    focus: mainGoal?.outcome ?? "Turn curiosity into small, verified experiments—and keep the evidence.",
    mainGoal,
    streakDays: Math.max(0, number(profile?.streak_days)),
    summary: {
      queued: queue.filter((item) => !["done", "archived"].includes(item.status)).length,
      active: experiments.filter((item) => ["in_progress", "active", "running"].includes(item.status)).length,
      completed: experiments.filter((item) => item.status === "done").length,
      lessons: records.filter((record) => record.frontmatter.type === "lesson").length,
      graphNodes: graph.nodes.length,
      privateRepos: experiments.filter((item) => item.privacy === "private").length,
    },
    queue,
    experiments,
    timeline,
    graph: {
      nodes: graphNodes,
      edges: graph.edges.map((edge) => ({ source: edge.source, target: edge.target, kind: edge.kind })),
    },
    sources: sourceItems(records, config),
    interests: interestItems(records, config),
    settings,
    publication,
    warnings,
  };
  return redactWorkspacePaths(snapshot, paths);
}

export async function mutateViewerRecord(id: string, patch: ViewerMutation) {
  if (!SAFE_ID.test(id)) throw new Error("Invalid record ID");
  const { paths, initialized } = await workspaceForViewer();
  if (!initialized) throw new Error("Initialize the workspace before editing records");
  const existing = await readRecord(paths.root, id);
  assertViewerMutationAllowed(existing.frontmatter, patch);
  const metadata: Record<string, unknown> = {};
  if (patch.starred !== undefined) metadata.starred = patch.starred;
  if (patch.rank !== undefined) metadata.rank = Math.max(1, Math.round(patch.rank));
  if (patch.scheduledAt !== undefined) metadata.scheduled_for = patch.scheduledAt || null;
  if (patch.reviewed !== undefined) metadata.reviewed_at = patch.reviewed ? new Date().toISOString() : null;
  if (patch.publicStoryReview !== undefined) metadata.public_story_review = patch.publicStoryReview;
  const record = await updateLocalMetadata(paths.root, id, {
    ...metadata,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  });
  let warning: string | undefined;
  try {
    await rebuildIndex(paths.root);
  } catch {
    warning = "The Markdown change was saved, but the derived index could not be rebuilt. Run auto-tinker index to repair it.";
  }
  return { record, warning };
}

export async function mutateViewerSettings(patch: { autoPublic: boolean }) {
  const { paths, initialized } = await workspaceForViewer();
  if (!initialized) throw new Error("Initialize the workspace before changing settings");
  const record = await updateConfig(paths.root, { auto_public: patch.autoPublic });
  let warning: string | undefined;
  try {
    await rebuildIndex(paths.root);
  } catch {
    warning = "The Markdown setting was saved, but the derived index could not be rebuilt. Run auto-tinker index to repair it.";
  }
  return { record, warning };
}

const promptIntent: Record<string, string> = {
  next: "start-next",
  start: "run",
  continue: "run",
  discover: "discover",
  "daily-review": "review",
  "graph-review": "review",
  "queue-plan": "review",
  "experiment-review": "review",
  "publish-review": "publish",
  publish: "publish",
  write: "publish",
  lesson: "learn",
};

const promptSkill: Record<string, string> = {
  setup: "auto-tinker-setup",
  diagnose: "auto-tinker-setup",
  backfill: "auto-tinker-history",
  profile: "auto-tinker-profile",
  settings: "auto-tinker-profile",
  sources: "auto-tinker-discover",
  "goal-change": "auto-tinker-profile",
  "goal-switch": "auto-tinker-profile",
  "writing-voice": "auto-tinker-profile",
};

const promptInstruction: Record<string, string> = {
  setup: "Initialize or repair this workspace, inspect the machine, and explain the resulting local configuration.",
  diagnose: "Run the Auto-Tinker doctor checks, diagnose why the local viewer cannot read the workspace, and fix only in-scope local issues.",
  backfill: "Review accessible work history, backfill durable records without duplication, and keep private material private.",
  profile: "Help me refine my interests, goals, constraints, preferred technologies, and dislikes from explicit input and verified history.",
  settings: "Show my current Auto-Tinker settings, then help me change the daily pace, concurrency, languages, privacy policy, or other local preferences I name.",
  sources: "Review my discovery sources and help me add, disable, or refine sources and filters. Keep the list local and explain why each source earns a place.",
  "goal-change": "Help me define or refine one concrete main goal with an outcome, horizon, success criteria, constraints, and evidence plan. Keep supporting goals distinct.",
  "goal-switch": "Show my main and supporting goals, compare the tradeoffs, and switch the main goal only after I choose one.",
  "writing-voice": "Show the private writing-voice profile, ask for concrete examples if needed, and refine it without inventing preferences. Keep private journals candid and public stories in my first-person voice.",
};

export async function promptForViewer(action: string, recordId?: string) {
  if (!/^[a-z][a-z-]{1,60}$/.test(action)) throw new Error("Invalid prompt action");
  if (recordId && !SAFE_ID.test(recordId)) throw new Error("Invalid record ID");
  const { paths, initialized } = await workspaceForViewer();
  const intent = promptIntent[action];
  if (initialized && intent) {
    try {
      return (await generatePrompt(paths.root, intent, recordId ? { target: recordId } : {})).prompt;
    } catch {
      // A setup-stage workspace may not have a profile or main goal yet. The
      // explicit fallback below remains useful and does not mutate state.
    }
  }

  let target = "";
  if (initialized && recordId) {
    try {
      const record = await readRecord(paths.root, recordId);
      target = `\nTarget record: ${record.frontmatter.title} (${record.frontmatter.id}).`;
    } catch {
      target = `\nTarget record ID: ${recordId}. Verify it exists before acting.`;
    }
  }
  const skill = promptSkill[action] ?? "auto-tinker";
  const instruction = promptInstruction[action] ?? `Handle this Auto-Tinker intent: ${action}.`;
  return [
    `Work in ${paths.root}. Read AGENTS.md and relevant local docs first.`,
    `Use the $${skill} skill. ${instruction}${target}`,
    "Keep Markdown as the source of truth. Preserve manual queue order. New repos and records stay private by default.",
    "Do not publish or change remote visibility without the durable policy and required approval. Report exact files, commands, and verification evidence.",
  ].join("\n\n");
}
