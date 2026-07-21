import { Command, CommanderError, Option } from "commander";
import {
  addCandidate,
  addDiscoverySource,
  addSupportingGoal,
  appendJournal,
  buildRepoPlan,
  captureHistory,
  completeExperiment,
  currentSettings,
  createExperiment,
  createLesson,
  createPrivateRepository,
  discoverCandidates,
  doctor,
  evaluateCandidate,
  generatePrompt,
  getGoals,
  getMainGoal,
  getProfile,
  graphForWorkspace,
  importHistory,
  initializeWorkspace,
  inspectAndSaveMachine,
  listDiscoverySources,
  listQueue,
  nextQueue,
  publishRepository,
  rebuildIndex,
  reconcileHistory,
  resolveWorkspace,
  reviewJournalOutput,
  setMainGoal,
  switchMainGoal,
  updateConfig,
  updateDiscoverySource,
  updateExperiment,
  updateLocalMetadata,
  updateProfile,
  updateQueue,
  AUTOMATION_MODES,
  SOURCE_CADENCES,
} from "../lib/auto-tinker";
import { AutoTinkerError, type CommandEnvelope, type EvidenceSnapshot, type ArtifactLocation, type LinkedOutput } from "../lib/auto-tinker/types";

type CliOptions = { workspace?: string; json?: boolean } & Record<string, unknown>;

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Expected an integer, received: ${value}`);
  return parsed;
}

function number(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, received: ${value}`);
  return parsed;
}

function boolean(value: string): boolean {
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`Expected true or false, received: ${value}`);
}

function parseJson<T>(value: string, label: string): T {
  try {
    const parsed = JSON.parse(value) as T;
    if (!parsed || typeof parsed !== "object") throw new Error("must be an object");
    return parsed;
  } catch (error) {
    throw new AutoTinkerError("INVALID_JSON_OPTION", `${label} must be valid JSON`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function optionValues(command: Command): CliOptions {
  return command.optsWithGlobals() as CliOptions;
}

function humanize(data: unknown): string {
  if (data === undefined) return "Done.";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

function emit<T>(envelope: CommandEnvelope<T>, jsonMode: boolean): void {
  if (jsonMode) process.stdout.write(`${JSON.stringify(envelope)}\n`);
  else if (envelope.ok) process.stdout.write(`${humanize(envelope.data)}\n`);
  else process.stderr.write(`${envelope.error?.code ?? "ERROR"}: ${envelope.error?.message ?? "Unknown error"}\n`);
}

async function workspaceAction<T>(
  commandName: string,
  command: Command,
  handler: (workspace: string, options: CliOptions) => Promise<T>,
  mutation = false,
): Promise<void> {
  const options = optionValues(command);
  const paths = await resolveWorkspace({ explicit: options.workspace as string | undefined });
  const data = await handler(paths.root, options);
  const warnings: string[] = [];
  if (mutation) {
    const indexed = await rebuildIndex(paths.root);
    warnings.push(`Derived index refreshed (${indexed.records} records)`);
  }
  emit({ ok: true, command: commandName, workspace: paths.root, data, warnings }, Boolean(options.json));
}

function addGlobalOptions(program: Command): void {
  program
    .option("-w, --workspace <path>", "Auto-Tinker workspace root; overrides AUTO_TINKER_WORKSPACE")
    .option("--json", "emit one machine-readable JSON envelope", false);
}

function addGoalOptions(command: Command, required: boolean): Command {
  if (required) command.requiredOption("--title <text>", "goal title").requiredOption("--outcome <markdown>", "desired outcome");
  else command.option("--title <text>", "goal title").option("--outcome <markdown>", "desired outcome");
  command
    .option("--success-criterion <text...>", "one or more measurable success criteria")
    .option("--horizon <text>", "time horizon")
    .option("--priority <number>", "priority, lower is sooner", integer)
    .option("--constraint <text...>", "goal constraints")
    .option("--target-role <text...>", "target roles")
    .option("--target-company <text...>", "target companies")
    .option("--target-topic <text...>", "target topics")
    .option("--exploration-budget <number>", "fraction reserved for exploration, 0 to 1", number)
    .option("--body <markdown>", "supporting narrative");
  return command;
}

function goalInput(options: CliOptions): Parameters<typeof setMainGoal>[1] {
  if (!options.title || !options.outcome) throw new AutoTinkerError("MISSING_GOAL", "--title and --outcome are required");
  const budget = options.explorationBudget as number | undefined;
  if (budget !== undefined && (budget < 0 || budget > 1)) throw new AutoTinkerError("INVALID_GOAL", "exploration budget must be between 0 and 1");
  return {
    title: String(options.title),
    outcome: String(options.outcome),
    success_criteria: options.successCriterion as string[] | undefined,
    horizon: options.horizon as string | undefined,
    priority: options.priority as number | undefined,
    constraints: options.constraint as string[] | undefined,
    target_roles: options.targetRole as string[] | undefined,
    target_companies: options.targetCompany as string[] | undefined,
    target_topics: options.targetTopic as string[] | undefined,
    exploration_budget: budget,
    body: options.body as string | undefined,
  };
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("auto-tinker")
    .description("Chat-first local learning and experiment workspace")
    .version("0.1.0")
    .showHelpAfterError()
    .exitOverride();
  addGlobalOptions(program);

  program
    .command("init [path]")
    .description("initialize a private Markdown-first workspace")
    .action(async (target: string | undefined, _options: unknown, command: Command) => {
      const options = optionValues(command);
      const root = target ?? (options.workspace as string | undefined) ?? process.cwd();
      const initialized = await initializeWorkspace(root);
      const indexed = await rebuildIndex(initialized.paths.root);
      emit(
        {
          ok: true,
          command: "init",
          workspace: initialized.paths.root,
          data: { created: initialized.created, paths: initialized.paths, indexed_records: indexed.records },
          warnings: [],
        },
        Boolean(options.json),
      );
    });

  program.command("doctor").description("validate records, privacy policy, tools, goals, secrets, and index freshness").action(async (_options, command) => {
    await workspaceAction("doctor", command, (workspace) => doctor(workspace));
  });

  const profile = program.command("profile").description("show or explicitly update the user-owned profile and writing voice");
  profile.action(async (_options, command) => workspaceAction("profile", command, (workspace) => getProfile(workspace)));
  profile.command("show").description("show the current profile").action(async (_options, command) => {
    await workspaceAction("profile show", command, (workspace) => getProfile(workspace));
  });
  profile
    .command("update")
    .description("update profile fields only from explicit user input")
    .option("--name <text>")
    .option("--tone <text>")
    .option("--interests <csv>", "comma-separated interests", csv)
    .option("--goals <csv>", "comma-separated supporting profile goals", csv)
    .option("--constraints <csv>", "comma-separated constraints", csv)
    .option("--languages <csv>", "comma-separated languages", csv)
    .option("--experiments-per-day <number>", "daily experiment target", integer)
    .option("--auto-public <boolean>", "durable automatic-publication policy", boolean)
    .option("--preferred-agent <id>", "safe agent ID used for generated chat prompts")
    .option("--max-concurrency <number>", "maximum simultaneous local experiments, 1 to 16", integer)
    .option("--discovery-sources <csv>", "default source record IDs or built-in aliases", csv)
    .option("--body <markdown>")
    .option("--directness <text>")
    .option("--first-person <boolean>", "prefer first-person writing", boolean)
    .option("--preferred-detail <text>")
    .option("--approved-example <text...>")
    .option("--banned-cliche <text...>")
    .action(async (_options, command) => {
      await workspaceAction(
        "profile update",
        command,
        (workspace, options) => {
          if (options.experimentsPerDay !== undefined && Number(options.experimentsPerDay) < 0) {
            throw new AutoTinkerError("INVALID_PROFILE", "experiments-per-day cannot be negative");
          }
          if (
            options.maxConcurrency !== undefined &&
            (Number(options.maxConcurrency) < 1 || Number(options.maxConcurrency) > 16)
          ) {
            throw new AutoTinkerError("INVALID_PROFILE", "max-concurrency must be between 1 and 16");
          }
          const voice = {
            ...(options.directness !== undefined ? { directness: options.directness } : {}),
            ...(options.firstPerson !== undefined ? { first_person: options.firstPerson } : {}),
            ...(options.preferredDetail !== undefined ? { preferred_detail: options.preferredDetail } : {}),
            ...(options.approvedExample !== undefined ? { approved_examples: options.approvedExample } : {}),
            ...(options.bannedCliche !== undefined ? { banned_cliches: options.bannedCliche } : {}),
            update_policy: "explicit-feedback-or-approved-writing-only",
          };
          return updateProfile(workspace, {
            name: options.name as string | undefined,
            tone: options.tone as string | undefined,
            interests: options.interests as string[] | undefined,
            goals: options.goals as string[] | undefined,
            constraints: options.constraints as string[] | undefined,
            languages: options.languages as string[] | undefined,
            experiments_per_day: options.experimentsPerDay as number | undefined,
            auto_public: options.autoPublic as boolean | undefined,
            preferred_agent: options.preferredAgent as string | undefined,
            max_concurrent: options.maxConcurrency as number | undefined,
            discovery_sources: options.discoverySources as string[] | undefined,
            body: options.body as string | undefined,
            ...(Object.keys(voice).length > 1 ? { writing_voice: voice } : {}),
          });
        },
        true,
      );
    });

  const config = program.command("config").description("show or explicitly update safe workspace defaults");
  config.action(async (_options, command) => workspaceAction("config", command, (workspace) => currentSettings(workspace)));
  config.command("show").description("show current workspace defaults").action(async (_options, command) => {
    await workspaceAction("config show", command, (workspace) => currentSettings(workspace));
  });
  config
    .command("update")
    .description("update safe agent, concurrency, and discovery-source defaults")
    .option("--preferred-agent <id>")
    .option("--max-concurrency <number>", "integer from 1 to 16", integer)
    .option("--discovery-sources <csv>", "source record IDs or built-in aliases", csv)
    .addOption(new Option("--automation-mode <mode>").choices([...AUTOMATION_MODES]))
    .option("--time-budget-minutes <number>", "bounded wall-clock budget from 1 to 1440", integer)
    .action(async (_options, command) => {
      await workspaceAction("config update", command, (workspace, options) => {
        if (
          options.preferredAgent === undefined &&
          options.maxConcurrency === undefined &&
          options.discoverySources === undefined &&
          options.automationMode === undefined &&
          options.timeBudgetMinutes === undefined
        ) {
          throw new AutoTinkerError("INVALID_CONFIG", "Supply at least one config field to update");
        }
        return updateConfig(workspace, {
          preferred_agent: options.preferredAgent as string | undefined,
          max_concurrent: options.maxConcurrency as number | undefined,
          discovery_sources: options.discoverySources as string[] | undefined,
          automation_mode: options.automationMode as (typeof AUTOMATION_MODES)[number] | undefined,
          time_budget_minutes: options.timeBudgetMinutes as number | undefined,
        });
      }, true);
    });

  const goal = program.command("goal").description("manage exactly one active main goal and supporting goals");
  goal.action(async (_options, command) => workspaceAction("goal", command, (workspace) => getMainGoal(workspace)));
  goal.command("show").description("show the main goal and supporting goals").action(async (_options, command) => {
    await workspaceAction("goal show", command, async (workspace) => ({ main: await getMainGoal(workspace), goals: await getGoals(workspace) }));
  });
  addGoalOptions(goal.command("set").description("replace fields on the active main goal"), true).action(async (_options, command) => {
    await workspaceAction("goal set", command, (workspace, options) => setMainGoal(workspace, goalInput(options)), true);
  });
  addGoalOptions(goal.command("add").description("add a supporting goal without changing the main goal"), true).action(async (_options, command) => {
    await workspaceAction("goal add", command, (workspace, options) => addSupportingGoal(workspace, goalInput(options)), true);
  });
  goal.command("switch <goal-id>").description("make a supporting goal the one active main goal").action(async (id: string, _options, command) => {
    await workspaceAction("goal switch", command, (workspace) => switchMainGoal(workspace, id), true);
  });

  program.command("inspect-machine").description("save a secret-free local capability snapshot").action(async (_options, command) => {
    await workspaceAction("inspect-machine", command, (workspace) => inspectAndSaveMachine(workspace), true);
  });

  const history = program.command("history").description("capture, import, and reconcile work history");
  history
    .command("import <path>")
    .option("--limit <number>", "maximum unique entries", integer, 1000)
    .option("--dry-run", "scan without writing")
    .action(async (source: string, _options, command) => {
      const options = optionValues(command);
      await workspaceAction(
        "history import",
        command,
        (workspace) => importHistory(workspace, source, { limit: options.limit as number, dryRun: Boolean(options.dryRun) }),
        !options.dryRun,
      );
    });
  history
    .command("capture")
    .requiredOption("--title <text>")
    .requiredOption("--summary <markdown>")
    .option("--occurred-at <iso>")
    .option("--source-ref <reference...>")
    .option("--tags <csv>", "comma-separated tags", csv)
    .action(async (_options, command) => {
      await workspaceAction(
        "history capture",
        command,
        (workspace, options) => captureHistory(workspace, {
          title: String(options.title),
          summary: String(options.summary),
          occurred_at: options.occurredAt as string | undefined,
          source_refs: options.sourceRef as string[] | undefined,
          tags: options.tags as string[] | undefined,
        }),
        true,
      );
    });
  history.command("reconcile").description("deduplicate history without erasing evidence").action(async (_options, command) => {
    await workspaceAction("history reconcile", command, (workspace) => reconcileHistory(workspace), true);
  });

  program
    .command("discover")
    .description("list locally saved discovery candidates; research remains agent-owned")
    .option("--status <status>")
    .option("--limit <number>", "maximum records", integer, 100)
    .action(async (_options, command) => {
      await workspaceAction("discover", command, (workspace, options) => discoverCandidates(workspace, { status: options.status as string | undefined, limit: options.limit as number }));
    });

  const source = program.command("source").description("manage the durable discovery-source catalog");
  source
    .command("list")
    .option("--enabled <boolean>", "filter by enabled state", boolean)
    .option("--kind <slug>", "filter by source kind")
    .action(async (_options, command) => {
      await workspaceAction("source list", command, (workspace, options) => listDiscoverySources(workspace, {
        enabled: options.enabled as boolean | undefined,
        kind: options.kind as string | undefined,
      }));
    });
  source
    .command("add")
    .requiredOption("--title <text>")
    .requiredOption("--kind <slug>", "source family such as github-search, rss, or package-registry")
    .option("--url <url>", "credential-free http or https URL")
    .option("--locator <locator>", "URL or safe local alias such as local://codex-history")
    .option("--enabled <boolean>", "enable this source", boolean, true)
    .option("--topics <csv>", "topic filters", csv)
    .option("--languages <csv>", "language filters", csv)
    .addOption(new Option("--cadence <cadence>").choices([...SOURCE_CADENCES]).default("weekly"))
    .option("--weight <number>", "ranking influence from 0 to 2; 1 is neutral", number, 1)
    .option("--techniques <csv>", "repeatable query patterns or collection techniques", csv)
    .option("--strengths <csv>", "where this source is especially useful", csv)
    .option("--rate-limit-notes <text>")
    .option("--trust-notes <markdown>")
    .option("--retrieved-at <date>", "ISO-8601 retrieval date or timestamp")
    .action(async (_options, command) => {
      await workspaceAction("source add", command, (workspace, options) => addDiscoverySource(workspace, {
        title: String(options.title),
        kind: String(options.kind),
        url: options.url as string | undefined,
        locator: options.locator as string | undefined,
        enabled: options.enabled as boolean,
        topics: options.topics as string[] | undefined,
        languages: options.languages as string[] | undefined,
        cadence: options.cadence as (typeof SOURCE_CADENCES)[number],
        weight: options.weight as number,
        techniques: options.techniques as string[] | undefined,
        strengths: options.strengths as string[] | undefined,
        rate_limit_notes: options.rateLimitNotes as string | undefined,
        trust_notes: options.trustNotes as string | undefined,
        retrieved_at: options.retrievedAt as string | undefined,
      }), true);
    });
  source
    .command("update <source-id>")
    .option("--title <text>")
    .option("--kind <slug>")
    .option("--url <url>")
    .option("--locator <locator>", "URL or safe local alias")
    .option("--enabled <boolean>", "enable or disable this source", boolean)
    .option("--topics <csv>", "replace topic filters", csv)
    .option("--languages <csv>", "replace language filters", csv)
    .addOption(new Option("--cadence <cadence>").choices([...SOURCE_CADENCES]))
    .option("--weight <number>", "ranking influence from 0 to 2", number)
    .option("--techniques <csv>", "replace query patterns or collection techniques", csv)
    .option("--strengths <csv>", "replace source strengths", csv)
    .option("--rate-limit-notes <text>")
    .option("--trust-notes <markdown>")
    .option("--retrieved-at <date>", "ISO-8601 retrieval date or timestamp")
    .action(async (id: string, _options, command) => {
      await workspaceAction("source update", command, (workspace, options) => updateDiscoverySource(workspace, id, {
        title: options.title as string | undefined,
        kind: options.kind as string | undefined,
        url: options.url as string | undefined,
        locator: options.locator as string | undefined,
        enabled: options.enabled as boolean | undefined,
        topics: options.topics as string[] | undefined,
        languages: options.languages as string[] | undefined,
        cadence: options.cadence as (typeof SOURCE_CADENCES)[number] | undefined,
        weight: options.weight as number | undefined,
        techniques: options.techniques as string[] | undefined,
        strengths: options.strengths as string[] | undefined,
        rate_limit_notes: options.rateLimitNotes as string | undefined,
        trust_notes: options.trustNotes as string | undefined,
        retrieved_at: options.retrievedAt as string | undefined,
      }), true);
    });

  const candidate = program.command("candidate").description("save and evaluate researched opportunities");
  candidate
    .command("add")
    .requiredOption("--title <text>")
    .requiredOption("--summary <markdown>")
    .option("--source <reference>")
    .option("--why <text>")
    .option("--tags <csv>", "comma-separated tags", csv)
    .option("--language <text>")
    .option("--repo-url <url>")
    .option("--score <number>", "0 to 100", number)
    .option("--goal-contribution <markdown>")
    .option("--distraction-risk <markdown>")
    .action(async (_options, command) => {
      await workspaceAction("candidate add", command, (workspace, options) => addCandidate(workspace, {
        title: String(options.title),
        summary: String(options.summary),
        source: options.source as string | undefined,
        why: options.why as string | undefined,
        tags: options.tags as string[] | undefined,
        language: options.language as string | undefined,
        repo_url: options.repoUrl as string | undefined,
        score: options.score as number | undefined,
        goal_contribution: options.goalContribution as string | undefined,
        distraction_risk: options.distractionRisk as string | undefined,
      }), true);
    });
  candidate
    .command("evaluate <id>")
    .requiredOption("--score <number>", "0 to 100", number)
    .option("--fit <number>", "0 to 100", number)
    .option("--novelty <number>", "0 to 100", number)
    .option("--feasibility <number>", "0 to 100", number)
    .option("--impact <number>", "0 to 100", number)
    .option("--recommendation <text>")
    .option("--notes <markdown>")
    .option("--goal-contribution <markdown>")
    .option("--distraction-risk <markdown>")
    .action(async (id: string, _options, command) => {
      await workspaceAction("candidate evaluate", command, (workspace, options) => evaluateCandidate(workspace, id, {
        score: options.score as number,
        fit: options.fit as number | undefined,
        novelty: options.novelty as number | undefined,
        feasibility: options.feasibility as number | undefined,
        impact: options.impact as number | undefined,
        recommendation: options.recommendation as string | undefined,
        notes: options.notes as string | undefined,
        goal_contribution: options.goalContribution as string | undefined,
        distraction_risk: options.distractionRisk as string | undefined,
      }), true);
    });

  const queue = program.command("queue").description("star, rank, schedule, block, and choose local queue items");
  queue.command("list").action(async (_options, command) => workspaceAction("queue list", command, (workspace) => listQueue(workspace)));
  queue
    .command("update <candidate-or-queue-id>")
    .option("--starred <boolean>", "star this item", boolean)
    .option("--priority <number>", "lower is sooner", integer)
    .option("--rank <number>", "manual rank", integer)
    .option("--scheduled-for <iso>")
    .option("--blocked-reason <text>")
    .option("--goal <text>")
    .option("--status <text>")
    .option("--goal-contribution <markdown>")
    .option("--distraction-risk <markdown>")
    .action(async (id: string, _options, command) => {
      await workspaceAction("queue update", command, (workspace, options) => updateQueue(workspace, id, {
        starred: options.starred as boolean | undefined,
        priority: options.priority as number | undefined,
        rank: options.rank as number | undefined,
        scheduled_for: options.scheduledFor as string | undefined,
        blocked_reason: options.blockedReason as string | undefined,
        goal: options.goal as string | undefined,
        status: options.status as string | undefined,
        goal_contribution: options.goalContribution as string | undefined,
        distraction_risk: options.distractionRisk as string | undefined,
      }), true);
    });
  queue.command("next").option("--count <number>", "number of items", integer, 1).action(async (_options, command) => {
    await workspaceAction("queue next", command, (workspace, options) => nextQueue(workspace, options.count as number));
  });

  const experiment = program.command("experiment").description("plan and record experiments independently of code availability");
  experiment
    .command("create")
    .requiredOption("--title <text>")
    .requiredOption("--goal <markdown>")
    .addOption(new Option("--mode <mode>").choices(["scratch", "adapt"]).default("scratch"))
    .option("--candidate <id>")
    .option("--source-repo <url>")
    .option("--repo-name <text>")
    .option("--tags <csv>", "comma-separated tags", csv)
    .option("--location <json...>", "artifact locations as JSON objects; repeat values")
    .action(async (_options, command) => {
      await workspaceAction("experiment create", command, (workspace, options) => createExperiment(workspace, {
        title: String(options.title),
        goal: String(options.goal),
        mode: options.mode as "scratch" | "adapt",
        candidate_id: options.candidate as string | undefined,
        source_repo: options.sourceRepo as string | undefined,
        repo_name: options.repoName as string | undefined,
        tags: options.tags as string[] | undefined,
        locations: (options.location as string[] | undefined)?.map((value) => parseJson<Partial<ArtifactLocation>>(value, "--location")),
      }), true);
    });
  experiment
    .command("update <id>")
    .option("--status <text>")
    .option("--summary <markdown>")
    .option("--repo-path <path>")
    .option("--repo-url <url>")
    .option("--test <summary...>")
    .addOption(new Option("--privacy <privacy>").choices(["private", "review"]))
    .option("--location <json...>", "artifact locations as JSON objects")
    .option("--evidence <json...>", "JSON evidence; kind=test|build|commit|file|screenshot|note|other")
    .addOption(new Option("--repository-publication-approval <state>").choices(["pending", "approved"]))
    .addOption(new Option("--readme-review <state>").choices(["pending", "approved"]))
    .addOption(new Option("--public-story-review <state>").choices(["pending", "approved"]))
    .option("--attribution <text>")
    .addOption(new Option("--license-review <state>").choices(["pending", "compatible", "approved", "blocked"]))
    .action(async (id: string, _options, command) => {
      await workspaceAction("experiment update", command, async (workspace, options) => {
        let updated = await updateExperiment(workspace, id, {
          status: options.status as string | undefined,
          summary: options.summary as string | undefined,
          repo_path: options.repoPath as string | undefined,
          repo_url: options.repoUrl as string | undefined,
          tests: options.test as string[] | undefined,
          privacy: options.privacy as "private" | "review" | undefined,
          locations: (options.location as string[] | undefined)?.map((value) => parseJson<Partial<ArtifactLocation>>(value, "--location")),
          evidence: (options.evidence as string[] | undefined)?.map((value) => parseJson<Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">>(value, "--evidence")),
          attribution: options.attribution as string | undefined,
          license_review: options.licenseReview as "pending" | "compatible" | "approved" | "blocked" | undefined,
        });
        if (options.repositoryPublicationApproval) {
          updated = await updateLocalMetadata(workspace, id, { repository_publication_approval: options.repositoryPublicationApproval });
        }
        if (options.readmeReview) updated = await updateLocalMetadata(workspace, id, { readme_review: options.readmeReview });
        if (options.publicStoryReview) updated = await updateLocalMetadata(workspace, id, { public_story_review: options.publicStoryReview });
        return updated;
      }, true);
    });
  experiment
    .command("complete <id>")
    .requiredOption("--summary <markdown>")
    .option("--test <summary...>")
    .option("--evidence <json...>", "JSON evidence; kind=test|build|commit|file|screenshot|note|other")
    .action(async (id: string, _options, command) => {
      await workspaceAction("experiment complete", command, (workspace, options) => completeExperiment(
        workspace,
        id,
        String(options.summary),
        [
          ...((options.test as string[] | undefined) ?? []).map((summary) => ({ kind: "test" as const, summary, status: "pass" as const })),
          ...((options.evidence as string[] | undefined) ?? []).map((value) => parseJson<Partial<EvidenceSnapshot> & Pick<EvidenceSnapshot, "summary">>(value, "--evidence")),
        ],
      ), true);
    });

  const lesson = program.command("lesson").description("record reusable, evidence-linked learning");
  lesson
    .command("create")
    .requiredOption("--title <text>")
    .requiredOption("--summary <markdown>")
    .option("--experiment <id>")
    .option("--capability <text...>")
    .option("--tags <csv>", "comma-separated tags", csv)
    .action(async (_options, command) => {
      await workspaceAction("lesson create", command, (workspace, options) => createLesson(workspace, {
        title: String(options.title),
        summary: String(options.summary),
        experiment_id: options.experiment as string | undefined,
        capabilities: options.capability as string[] | undefined,
        tags: options.tags as string[] | undefined,
      }), true);
    });

  const journal = program.command("journal").description("append isolated private/review writing outputs");
  journal
    .command("append")
    .requiredOption("--title <text>")
    .requiredOption("--body <markdown>")
    .option("--date <yyyy-mm-dd>")
    .option("--experiment <id>")
    .option("--tags <csv>", "comma-separated tags", csv)
    .addOption(new Option("--kind <kind>").choices(["private-journal", "readme", "changelog", "public-story"]).default("private-journal"))
    .action(async (_options, command) => {
      await workspaceAction("journal append", command, (workspace, options) => appendJournal(workspace, {
        title: String(options.title),
        body: String(options.body),
        date: options.date as string | undefined,
        experiment_id: options.experiment as string | undefined,
        tags: options.tags as string[] | undefined,
        kind: options.kind as LinkedOutput["kind"],
      }), true);
    });
  journal
    .command("review <journal-id>")
    .description("mark one writing output pending/approved and refresh its parent link without granting repository consent")
    .addOption(new Option("--state <state>").choices(["pending", "approved"]).makeOptionMandatory())
    .action(async (id: string, _options, command) => {
      await workspaceAction(
        "journal review",
        command,
        (workspace, options) => reviewJournalOutput(workspace, id, options.state as "pending" | "approved"),
        true,
      );
    });

  program.command("index").description("rebuild the disposable SQLite index and JSON snapshots from Markdown").action(async (_options, command) => {
    await workspaceAction("index", command, (workspace) => rebuildIndex(workspace));
  });
  program.command("graph").description("emit a graph snapshot without requiring code to be present").action(async (_options, command) => {
    await workspaceAction("graph", command, (workspace) => graphForWorkspace(workspace));
  });
  program
    .command("prompt <intent>")
    .description("generate exact text to paste into the chosen coding agent")
    .option("--target <id>")
    .option("--agent <name>", "agent name; defaults to config preferred_agent")
    .action(async (intent: string, _options, command) => {
      await workspaceAction("prompt", command, (workspace, options) => generatePrompt(workspace, intent, {
        target: options.target as string | undefined,
        agent: options.agent as string | undefined,
      }));
    });

  const repo = program.command("repo").description("plan private repositories and approval-gated publication");
  repo.command("plan <experiment-id>").option("--owner <name>").action(async (id: string, _options, command) => {
    await workspaceAction("repo plan", command, (workspace, options) => buildRepoPlan(workspace, id, options.owner as string | undefined));
  });
  repo.command("create-private <experiment-id>").option("--owner <name>").option("--dry-run", "show the private creation plan without calling GitHub").action(async (id: string, _options, command) => {
    const options = optionValues(command);
    await workspaceAction("repo create-private", command, (workspace) => createPrivateRepository(workspace, id, {
      owner: options.owner as string | undefined,
      dryRun: Boolean(options.dryRun),
    }), !options.dryRun);
  });
  repo.command("publish <experiment-id>").option("--approve", "grant consent for this publish run; durable approval uses experiment update").option("--dry-run", "preflight policy and read-only private-remote verification without changing GitHub").action(async (id: string, _options, command) => {
    const options = optionValues(command);
    await workspaceAction("repo publish", command, (workspace) => publishRepository(workspace, id, {
      approve: Boolean(options.approve),
      dryRun: Boolean(options.dryRun),
    }), !options.dryRun);
  });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && ["commander.helpDisplayed", "commander.version"].includes(error.code)) return;
    const jsonMode = argv.includes("--json");
    const normalized =
      error instanceof AutoTinkerError
        ? error
        : new AutoTinkerError(error instanceof CommanderError ? "CLI_USAGE" : "UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error));
    emit(
      {
        ok: false,
        command: argv.slice(2).filter((arg) => !arg.startsWith("-")).slice(0, 3).join(" ") || "unknown",
        warnings: [],
        error: { code: normalized.code, message: normalized.message, ...(normalized.details !== undefined ? { details: normalized.details } : {}) },
      },
      jsonMode,
    );
    process.exitCode = error instanceof CommanderError ? error.exitCode || 1 : 1;
  }
}
