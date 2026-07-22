import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  appendEvent,
  createRecord,
  currentDeviceId,
  getGoals,
  getMainGoal,
  initializeWorkspace,
  readAllRecords,
  resolveWorkspace,
  setMainGoal,
  switchMainGoal,
  addSupportingGoal,
  updateRecord,
} from "../../src/lib/auto-tinker";

const workspaces: string[] = [];
const execFileAsync = promisify(execFile);
async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "auto-tinker-test-"));
  workspaces.push(root);
  await initializeWorkspace(root);
  return root;
}
afterEach(async () => Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("workspace and canonical vault", () => {
  it("initializes private neutral records, random device identity, and one main goal", async () => {
    const root = await workspace();
    const records = await readAllRecords(root);
    expect(records.map((record) => record.frontmatter.type).sort()).toEqual(["config", "device", "goal", "profile", "source"]);
    expect(records.every((record) => record.frontmatter.privacy === "private")).toBe(true);
    const config = records.find((record) => record.frontmatter.type === "config")!;
    expect(config.frontmatter).toMatchObject({
      preferred_agent: "codex",
      max_concurrent: 1,
      automation_mode: "discover-only",
      time_budget_minutes: 60,
      auto_public: false,
    });
    const localHistory = records.find((record) => record.frontmatter.type === "source")!;
    expect(localHistory.frontmatter).toMatchObject({
      source_kind: "local-history",
      locator: "local://codex-history",
      enabled: true,
      weight: 1.2,
    });
    expect(String(localHistory.path)).not.toContain("codex-history");
    const device = records.find((record) => record.frontmatter.type === "device")!;
    expect(device.frontmatter.id).toMatch(/^device-[0-9a-f-]{36}$/);
    expect(JSON.stringify(device)).not.toContain(process.env.HOSTNAME ?? "__no_hostname__");
    expect((await getMainGoal(root)).path).toBe(path.join(root, ".auto-tinker", "goals", "main.md"));
  });

  it("resolves explicit, environment, and upward workspaces", async () => {
    const root = await workspace();
    const nested = path.join(root, "tinkers", "nested", "deeper");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(nested, { recursive: true }));
    expect((await resolveWorkspace({ explicit: root })).root).toBe(await import("node:fs/promises").then(({ realpath }) => realpath(root)));
    expect((await resolveWorkspace({ env: { ...process.env, AUTO_TINKER_WORKSPACE: root }, cwd: tmpdir() })).root).toContain("auto-tinker-test-");
    expect((await resolveWorkspace({ cwd: nested, env: { ...process.env, AUTO_TINKER_WORKSPACE: undefined } })).root).toContain("auto-tinker-test-");
  });

  it("initializes safely inside a Git clone without exposing local state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "auto-tinker-git-clone-"));
    workspaces.push(root);
    const productIgnore = await readFile(new URL("../../.gitignore", import.meta.url), "utf8");
    await writeFile(path.join(root, ".gitignore"), productIgnore);
    await writeFile(path.join(root, "README.md"), "# Product checkout\n");
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    await execFileAsync("git", ["add", ".gitignore", "README.md"], { cwd: root });
    const before = (await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: root })).stdout;

    const first = await initializeWorkspace(root);
    const second = await initializeWorkspace(root);
    await mkdir(path.join(root, "tinkers", "sample"), { recursive: true });
    await writeFile(path.join(root, "tinkers", "sample", "README.md"), "nested repository fixture\n");
    await writeFile(path.join(root, "tasks", "local.md"), "ignored task log\n");
    await mkdir(path.join(root, "private"), { recursive: true });
    await writeFile(path.join(root, "private", "notes.md"), "ignored personal note\n");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect((await resolveWorkspace({ cwd: path.join(root, "tinkers", "sample") })).root).toBe(await realpath(root));
    const after = (await execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: root })).stdout;
    expect(after).toBe(before);
    for (const localPath of [
      ".auto-tinker/config.md",
      "tinkers/sample/README.md",
      "tasks/local.md",
      "private/notes.md",
    ]) {
      await expect(execFileAsync("git", ["check-ignore", "--quiet", localPath], { cwd: root })).resolves.toBeDefined();
    }
  });

  it("redacts secrets before Markdown is written", async () => {
    const root = await workspace();
    const record = await createRecord(root, "lesson", {
      title: "Token handling",
      body: "api_key=supersecretvalue and npm_abcdefghijklmnopqrstuvwxyz",
    });
    const contents = await readFile(record.path!, "utf8");
    expect(contents).not.toContain("supersecretvalue");
    expect(contents).not.toContain("npm_abcdefghijklmnopqrstuvwxyz");
    expect(contents).toContain("REDACTED");
  });

  it("deduplicates append-only events and rejects updates", async () => {
    const root = await workspace();
    const first = await appendEvent(root, { title: "Same", event_kind: "test", occurred_at: "2026-01-01T00:00:00.000Z", body: "evidence" });
    const second = await appendEvent(root, { title: "Same", event_kind: "test", occurred_at: "2026-01-01T00:00:00.000Z", body: "evidence" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.frontmatter.id).toBe(first.record.frontmatter.id);
    await expect(updateRecord(root, first.record.frontmatter.id, { status: "changed" })).rejects.toMatchObject({ code: "APPEND_ONLY" });
  });

  it("switches main goals without changing either stable ID", async () => {
    const root = await workspace();
    await setMainGoal(root, { title: "Ship", outcome: "Ship the POC" });
    const supporting = await addSupportingGoal(root, { title: "Learn Rust", outcome: "Build one Rust tool" });
    const previous = await getMainGoal(root);
    const result = await switchMainGoal(root, supporting.frontmatter.id);
    expect(result.main.frontmatter.id).toBe(supporting.frontmatter.id);
    expect(result.demoted.frontmatter.id).toBe(previous.frontmatter.id);
    expect((await getGoals(root)).filter((goal) => goal.frontmatter.is_main === true)).toHaveLength(1);
  });

  it("uses a local-only pointer when synced vaults contain multiple devices", async () => {
    const root = await workspace();
    const original = await currentDeviceId(root);
    await createRecord(root, "device", {
      id: "device-11111111-1111-4111-8111-111111111111",
      title: "Another synced device",
      status: "active",
      privacy: "private",
      metadata: { label: "Another device" },
    });
    expect(await currentDeviceId(root)).toBe(original);
  });
});
