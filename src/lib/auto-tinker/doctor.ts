import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getGoals } from "./goals";
import { inspectMachine } from "./machine";
import { findPotentialSecrets } from "./security";
import { pathExists, readMarkdownRecord } from "./markdown";
import { listRecordFiles, readConfig, validateRecord } from "./vault";
import { VAULT_DIRECTORIES, workspacePaths } from "./workspace";
import type { DoctorCheck, DoctorResult } from "./types";

export async function doctor(workspace: string): Promise<DoctorResult> {
  const paths = workspacePaths(workspace);
  const checks: DoctorCheck[] = [];
  checks.push({
    name: "workspace",
    status: (await pathExists(paths.config)) ? "pass" : "fail",
    message: (await pathExists(paths.config)) ? `Workspace found at ${paths.root}` : "Missing .auto-tinker/config.md",
  });

  const missingDirectories: string[] = [];
  for (const directory of VAULT_DIRECTORIES) {
    if (!(await pathExists(path.join(paths.vault, directory)))) missingDirectories.push(directory);
  }
  checks.push({
    name: "vault-directories",
    status: missingDirectories.length ? "fail" : "pass",
    message: missingDirectories.length ? `Missing: ${missingDirectories.join(", ")}` : "Canonical vault directories are present",
  });

  try {
    const config = await readConfig(workspace);
    const validPolicy = config.frontmatter.default_privacy === "private" && typeof config.frontmatter.auto_public === "boolean";
    checks.push({
      name: "privacy-policy",
      status: validPolicy ? "pass" : "fail",
      message: validPolicy
        ? `Private-by-default policy is active; auto-public is ${config.frontmatter.auto_public ? "enabled" : "disabled"}`
        : "default_privacy must be private and auto_public must be boolean",
    });
  } catch (error) {
    checks.push({ name: "privacy-policy", status: "fail", message: error instanceof Error ? error.message : String(error) });
  }

  const files = await listRecordFiles(workspace);
  const ids = new Map<string, string[]>();
  const issues: string[] = [];
  const secretKinds = new Set<string>();
  for (const file of files) {
    try {
      const contents = await readFile(file, "utf8");
      findPotentialSecrets(contents).forEach((finding) => secretKinds.add(finding.kind));
      const record = await readMarkdownRecord(file);
      const validation = validateRecord(record);
      issues.push(...validation.map((issue) => `${path.relative(paths.root, file)}: ${issue.field ?? "record"} ${issue.message}`));
      ids.set(record.frontmatter.id, [...(ids.get(record.frontmatter.id) ?? []), file]);
    } catch (error) {
      issues.push(`${path.relative(paths.root, file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const duplicateIds = [...ids.entries()].filter(([, locations]) => locations.length > 1);
  checks.push({
    name: "canonical-records",
    status: issues.length || duplicateIds.length ? "fail" : "pass",
    message: issues.length || duplicateIds.length ? `${issues.length} validation issue(s), ${duplicateIds.length} duplicate ID(s)` : `${files.length} valid Markdown records`,
    ...(issues.length || duplicateIds.length
      ? { details: { issues: issues.slice(0, 25), duplicate_ids: duplicateIds.map(([id]) => id) } }
      : {}),
  });
  checks.push({
    name: "secret-scan",
    status: secretKinds.size ? "fail" : "pass",
    message: secretKinds.size ? `Potential secret material detected (${[...secretKinds].sort().join(", ")}); values are intentionally not shown` : "No known secret patterns found",
  });

  try {
    const goals = await getGoals(workspace);
    const main = goals.filter((goal) => goal.frontmatter.is_main === true && goal.frontmatter.status === "active");
    const mainPath = path.join(paths.vault, "goals", "main.md");
    checks.push({
      name: "main-goal",
      status: main.length === 1 && main[0].path === mainPath ? "pass" : "fail",
      message: main.length === 1 && main[0].path === mainPath ? `Main goal: ${main[0].frontmatter.title}` : `Expected exactly one active main goal at goals/main.md; found ${main.length}`,
    });
  } catch (error) {
    checks.push({ name: "main-goal", status: "fail", message: error instanceof Error ? error.message : String(error) });
  }

  const indexExists = await pathExists(paths.index);
  let indexStatus: DoctorCheck["status"] = indexExists ? "pass" : "warn";
  let indexMessage = indexExists ? "Derived SQLite index exists" : "Derived index is absent; run `auto-tinker index`";
  if (indexExists) {
    const indexMtime = (await stat(paths.index)).mtimeMs;
    const newestMarkdown = Math.max(0, ...(await Promise.all(files.map(async (file) => (await stat(file)).mtimeMs))));
    if (newestMarkdown > indexMtime) {
      indexStatus = "warn";
      indexMessage = "Derived index is stale; run `auto-tinker index`";
    }
  }
  checks.push({ name: "derived-index", status: indexStatus, message: indexMessage });

  const machine = await inspectMachine(workspace);
  checks.push({
    name: "git",
    status: machine.tools.git.available ? "pass" : "warn",
    message: machine.tools.git.available ? machine.tools.git.version ?? "git is available" : "git is unavailable; local experiment work will be limited",
  });
  checks.push({
    name: "github-cli",
    status: machine.tools.gh.available ? "pass" : "warn",
    message: machine.tools.gh.available ? machine.tools.gh.version ?? "GitHub CLI is available" : "gh is unavailable; repository publication is disabled",
  });
  return { ok: checks.every((check) => check.status !== "fail"), workspace: paths.root, checks };
}
