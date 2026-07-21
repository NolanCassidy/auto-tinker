import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProgram } from "../../src/cli/program";
import {
  addDiscoverySource,
  generatePrompt,
  initializeWorkspace,
  listDiscoverySources,
  readConfig,
  updateConfig,
  updateDiscoverySource,
  updateProfile,
} from "../../src/lib/auto-tinker";

const roots: string[] = [];
async function setup(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "auto-tinker-source-"));
  roots.push(root);
  await initializeWorkspace(root);
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("discovery source catalog and explicit configuration", () => {
  it("documents every accepted evidence kind in CLI help metadata", () => {
    const program = buildProgram();
    const experiment = program.commands.find((command) => command.name() === "experiment")!;
    for (const commandName of ["update", "complete"]) {
      const command = experiment.commands.find((candidate) => candidate.name() === commandName)!;
      const evidence = command.options.find((option) => option.long === "--evidence")!;
      expect(evidence.description).toContain("test|build|commit|file|screenshot|note|other");
    }
  });

  it("exposes source add/list/update through the CLI and writes stable Markdown records", async () => {
    const root = await setup();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync([
      "node",
      "auto-tinker",
      "--workspace",
      root,
      "--json",
      "source",
      "add",
      "--title",
      "GitHub TypeScript search",
      "--kind",
      "github-search",
      "--url",
      "https://github.com/search?q=language%3Atypescript&type=repositories",
      "--topics",
      "agents,local-first",
      "--languages",
      "TypeScript",
      "--cadence",
      "daily",
      "--weight",
      "1.4",
      "--techniques",
      "sort:updated topic:agents,compare releases with maintainer activity",
      "--strengths",
      "dated repository activity,license metadata",
      "--rate-limit-notes",
      "Use authenticated search sparingly and cache the retrieval date.",
      "--trust-notes",
      "Primary repository metadata; verify popularity claims against dated results.",
      "--retrieved-at",
      "2026-07-21",
    ]);
    const envelope = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
    expect(envelope).toMatchObject({ ok: true, command: "source add" });
    const id = envelope.data.frontmatter.id as string;
    expect(id).toMatch(/^source-catalog-[a-f0-9]{16}$/);

    const stored = (await listDiscoverySources(root)).find((record) => record.frontmatter.source_kind === "github-search")!;
    expect(stored.frontmatter).toMatchObject({
      id,
      type: "source",
      source_kind: "github-search",
      enabled: true,
      cadence: "daily",
      weight: 1.4,
      techniques: ["sort:updated topic:agents", "compare releases with maintainer activity"],
      strengths: ["dated repository activity", "license metadata"],
      topics: ["agents", "local-first"],
      languages: ["TypeScript"],
    });
    expect(await readFile(stored.path!, "utf8")).toContain("retrieved_at: 2026-07-21T00:00:00.000Z");

    await expect(addDiscoverySource(root, {
      title: "A renamed duplicate",
      kind: "github-search",
      url: "https://github.com/search?q=language%3Atypescript&type=repositories",
    })).rejects.toMatchObject({ code: "SOURCE_LOCATOR_EXISTS" });
    await expect(addDiscoverySource(root, {
      title: "A canonically equivalent duplicate",
      kind: "github-search",
      url: "https://github.com/search?type=repositories&q=language%3Atypescript#ignored",
    })).rejects.toMatchObject({ code: "SOURCE_LOCATOR_EXISTS" });
    await expect(updateDiscoverySource(root, id, {
      url: "https://github.com/search?q=topic%3Aagents&type=repositories",
    })).rejects.toMatchObject({ code: "SOURCE_LOCATOR_IMMUTABLE" });

    const updated = await updateDiscoverySource(root, id, {
      enabled: false,
      cadence: "weekly",
      weight: 0.6,
      techniques: ["topic:typescript sort:updated"],
      topics: ["typescript"],
      trust_notes: "Disabled while the query is noisy.",
    });
    expect(updated.frontmatter).toMatchObject({
      enabled: false,
      status: "disabled",
      cadence: "weekly",
      weight: 0.6,
      techniques: ["topic:typescript sort:updated"],
      topics: ["typescript"],
    });
    expect((await listDiscoverySources(root, { enabled: true, kind: "github-search" }))).toHaveLength(0);
    expect((await listDiscoverySources(root, { enabled: false, kind: "github-search" }))).toHaveLength(1);
  });

  it("rejects credential-bearing source URLs", async () => {
    const root = await setup();
    await expect(addDiscoverySource(root, {
      title: "Unsafe feed",
      kind: "rss",
      url: "https://user:password@example.com/feed.xml",
    })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
    await expect(addDiscoverySource(root, {
      title: "Overweighted feed",
      kind: "rss",
      url: "https://example.com/feed.xml",
      weight: 2.1,
    })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });

  it("stores local discovery inputs as safe aliases without absolute paths", async () => {
    const root = await setup();
    const local = await addDiscoverySource(root, {
      title: "Imported task notes",
      kind: "local-notes",
      locator: "local:task-notes",
      techniques: ["scan bounded task summaries", "preserve source record IDs"],
    });
    expect(local.frontmatter).toMatchObject({
      source_kind: "local-notes",
      locator: "local://task-notes",
      techniques: ["scan bounded task summaries", "preserve source record IDs"],
    });
    expect(local.frontmatter.url).toBeUndefined();
    expect(local.frontmatter.source_refs).toEqual(["local://task-notes"]);
    expect(await readFile(local.path!, "utf8")).not.toContain(root);

    await expect(addDiscoverySource(root, {
      title: "Unsafe local path",
      kind: "local-history",
      locator: `${root}/.codex/history`,
    })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
    await expect(addDiscoverySource(root, {
      title: "Unsafe file URI",
      kind: "local-history",
      locator: "file:///Users/example/.codex/history",
    })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
  });

  it("validates preferred agent, concurrency, and source defaults before saving", async () => {
    const root = await setup();
    await updateProfile(root, {
      preferred_agent: "ChatGPT",
      max_concurrent: 3,
      discovery_sources: ["source-catalog-1234567890abcdef", "github-trending"],
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync([
      "node",
      "auto-tinker",
      "--workspace",
      root,
      "--json",
      "config",
      "update",
      "--automation-mode",
      "create-private-remote",
      "--time-budget-minutes",
      "90",
    ]);
    const config = await readConfig(root);
    expect(config.frontmatter).toMatchObject({
      preferred_agent: "chatgpt",
      max_concurrent: 3,
      discovery_sources: ["source-catalog-1234567890abcdef", "github-trending"],
      automation_mode: "create-private-remote",
      time_budget_minutes: 90,
    });
    const prompt = await generatePrompt(root, "automate");
    expect(prompt.agent).toBe("chatgpt");
    expect(prompt.prompt).toContain("mode=create-private-remote; time_budget_minutes=90; max_concurrent=3");
    await expect(updateConfig(root, { preferred_agent: "codex; rm -rf" })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { max_concurrent: 0 })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { max_concurrent: 17 })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { automation_mode: "publish-public" as never })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { time_budget_minutes: 0 })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { time_budget_minutes: 1_441 })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(updateConfig(root, { discovery_sources: ["https://example.com/?token=secret"] })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
  });

  it("generates a bounded, absolute, scheduler-safe daily capsule", async () => {
    const root = await setup();
    await updateConfig(root, {
      automation_mode: "execute-local",
      experiments_per_day: 2,
      max_concurrent: 1,
      time_budget_minutes: 45,
    });
    const generated = await generatePrompt(root, "daily");
    const prompt = generated.prompt;
    expect(prompt).toContain(`workspace=${path.resolve(root)}`);
    expect(prompt).toMatch(/timezone=[A-Za-z_+/-]+/);
    expect(prompt).toMatch(/date_window_local=\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/);
    expect(prompt).toContain("saved_policy: mode=execute-local; experiments_per_day=2; max_concurrent=1; time_budget_minutes=45");
    expect(prompt).toContain(`allowed_mutation_roots=${path.join(root, ".auto-tinker")},${path.join(root, "tinkers")},${path.join(root, "tasks")}`);
    expect(prompt).toContain("network_policy=");
    expect(prompt).toContain("stop_rules=");
    expect(prompt).toContain("$auto-tinker-automate first");
    const orderedSkills = [
      "$auto-tinker-history",
      "$auto-tinker-discover",
      "$auto-tinker-queue",
      "$auto-tinker-run",
      "$auto-tinker-learn",
      "$auto-tinker-review",
    ];
    for (let index = 1; index < orderedSkills.length; index += 1) {
      expect(prompt.indexOf(orderedSkills[index - 1])).toBeLessThan(prompt.indexOf(orderedSkills[index]));
    }
    expect(prompt).toContain("$auto-tinker-publish only to create a new PRIVATE remote");
    expect(prompt).toContain("Do not publish PUBLIC solely because automation");
  });
});
