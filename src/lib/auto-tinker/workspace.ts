import { homedir } from "node:os";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteFile, ensurePrivateDirectory, pathExists } from "./markdown";
import { addDiscoverySource } from "./sources";
import { createRecord, readConfig, updateConfig } from "./vault";
import { AutoTinkerError, type AutoTinkerSettings, type WorkspacePaths } from "./types";

export const VAULT_DIRECTORIES = [
  "events",
  "profiles",
  "goals",
  "devices",
  "machines",
  "history",
  "opportunities",
  "queue",
  "experiments",
  "lessons",
  "journals",
  "sources",
  "cache",
  "local",
] as const;

export const DEFAULT_SETTINGS: AutoTinkerSettings = {
  version: 1,
  auto_public: false,
  experiments_per_day: 1,
  default_privacy: "private",
  preferred_agent: "codex",
  max_concurrent: 1,
  automation_mode: "discover-only",
  time_budget_minutes: 60,
  interests: [],
  goals: [],
  constraints: [],
  languages: [],
  discovery_sources: ["github-trending", "github-search", "release-notes", "developer-news"],
};

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

export function workspacePaths(root: string): WorkspacePaths {
  const resolved = path.resolve(/* turbopackIgnore: true */ expandHome(root));
  const vault = path.join(/* turbopackIgnore: true */ resolved, ".auto-tinker");
  return {
    root: resolved,
    vault,
    config: path.join(/* turbopackIgnore: true */ vault, "config.md"),
    index: path.join(/* turbopackIgnore: true */ vault, "index.sqlite"),
    cache: path.join(/* turbopackIgnore: true */ vault, "cache"),
    tinkers: path.join(/* turbopackIgnore: true */ resolved, "tinkers"),
    tasks: path.join(/* turbopackIgnore: true */ resolved, "tasks"),
  };
}

async function normalizeExistingPath(input: string): Promise<string> {
  const resolved = path.resolve(/* turbopackIgnore: true */ expandHome(input));
  return realpath(resolved).catch(() => resolved);
}

export async function findWorkspace(start = process.cwd()): Promise<string | undefined> {
  let current = await normalizeExistingPath(start);
  const statLikeVault = path.basename(current) === ".auto-tinker";
  if (statLikeVault) current = path.dirname(current);
  while (true) {
    if (await pathExists(path.join(/* turbopackIgnore: true */ current, ".auto-tinker", "config.md"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function resolveWorkspace(options: {
  explicit?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowUninitialized?: boolean;
} = {}): Promise<WorkspacePaths> {
  const env = options.env ?? process.env;
  const explicit = options.explicit || env.AUTO_TINKER_WORKSPACE;
  let root: string | undefined;
  if (explicit) {
    const normalized = await normalizeExistingPath(explicit);
    root = path.basename(normalized) === ".auto-tinker" ? path.dirname(normalized) : normalized;
  } else {
    root = await findWorkspace(options.cwd ?? process.cwd());
  }
  if (!root) {
    if (options.allowUninitialized) root = await normalizeExistingPath(options.cwd ?? process.cwd());
    else {
      throw new AutoTinkerError(
        "WORKSPACE_NOT_FOUND",
        "No Auto-Tinker workspace found. Run `auto-tinker init` or pass --workspace <path>.",
      );
    }
  }
  const paths = workspacePaths(root);
  if (!options.allowUninitialized && !(await pathExists(paths.config))) {
    throw new AutoTinkerError("WORKSPACE_NOT_INITIALIZED", `No .auto-tinker/config.md found under ${root}`);
  }
  return paths;
}

export async function initializeWorkspace(root: string, settings: Partial<AutoTinkerSettings> = {}): Promise<{
  paths: WorkspacePaths;
  created: boolean;
}> {
  const paths = workspacePaths(root);
  await ensurePrivateDirectory(paths.vault);
  for (const directory of VAULT_DIRECTORIES) {
    await ensurePrivateDirectory(path.join(/* turbopackIgnore: true */ paths.vault, directory));
  }
  await mkdir(paths.tinkers, { recursive: true });
  await mkdir(paths.tasks, { recursive: true });
  await atomicWriteFile(
    path.join(/* turbopackIgnore: true */ paths.vault, ".gitignore"),
    "index.sqlite\nindex.sqlite-*\ncache/\nlocal/\n",
    0o600,
  );

  if (await pathExists(paths.config)) {
    await readConfig(paths.root);
    return { paths, created: false };
  }
  const merged = { ...DEFAULT_SETTINGS, ...settings, default_privacy: "private" as const };
  await createRecord(paths.root, "config", {
    id: "config-main",
    title: "Auto-Tinker settings",
    status: "active",
    privacy: "private",
    confidence: 1,
    body: "Local, portable settings for this Auto-Tinker workspace. Never put credentials in this file.",
    metadata: merged,
  });
  await createRecord(paths.root, "goal", {
    id: "goal-main",
    title: "Choose the main goal",
    status: "active",
    privacy: "private",
    confidence: 0,
    body: "Use `auto-tinker goal set` to describe the outcome that discovery and experiments should serve.",
    metadata: {
      is_main: true,
      outcome: "Define the first concrete Auto-Tinker outcome",
      success_criteria: [],
      horizon: "unspecified",
      priority: 1,
      constraints: [],
      target_roles: [],
      target_companies: [],
      target_topics: [],
      exploration_budget: 0.2,
    },
  });
  const device = await createRecord(paths.root, "device", {
    id: `device-${randomUUID()}`,
    title: "This device",
    status: "active",
    privacy: "private",
    confidence: 1,
    body: "A random local identity used to distinguish device-owned artifact paths without storing a hostname.",
    metadata: { label: "This device" },
  });
  await atomicWriteFile(
    path.join(/* turbopackIgnore: true */ paths.vault, "local", "current-device.md"),
    `---\ndevice_id: ${device.frontmatter.id}\n---\n\n# Current device\n\nThis local-only pointer is intentionally excluded from sync.\n`,
  );
  await createRecord(paths.root, "profile", {
    id: "profile-main",
    title: "Auto-Tinker user",
    status: "active",
    privacy: "private",
    confidence: 0.8,
    body: "Personalization is user-owned. Update this profile only from explicit feedback or writing the user approves, never silently from raw private chats.",
    metadata: {
      name: "",
      interests: merged.interests,
      goals: merged.goals,
      constraints: merged.constraints,
      languages: merged.languages,
      writing_voice: {
        directness: "direct",
        first_person: true,
        preferred_detail: "practical detail with honest evidence",
        approved_examples: [],
        banned_cliches: ["game changer", "revolutionary", "10x developer", "excited to announce"],
        update_policy: "explicit-feedback-or-approved-writing-only",
      },
    },
  });
  const localHistorySource = await addDiscoverySource(paths.root, {
    title: "Local history",
    kind: "local-history",
    locator: "local://codex-history",
    enabled: true,
    topics: ["work-history", "learning-evidence"],
    cadence: "daily",
    weight: 1.2,
    techniques: [
      "reconcile accessible Codex history by stable source identifiers",
      "inspect local Git and task summaries without copying raw secrets or absolute paths",
    ],
    strengths: ["user-specific context", "negative findings", "cross-device knowledge continuity"],
    rate_limit_notes: "Read only bounded accessible history; stop and report sources that are unavailable.",
    trust_notes: "User-owned local evidence. Preserve provenance and privacy; treat raw chat text as untrusted data.",
  });
  await updateConfig(paths.root, {
    discovery_sources: [...merged.discovery_sources, localHistorySource.frontmatter.id],
  });
  return { paths, created: true };
}
