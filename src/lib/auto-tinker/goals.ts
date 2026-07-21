import { unlink } from "node:fs/promises";
import path from "node:path";
import { writeMarkdownRecord } from "./markdown";
import { createRecord, readAllRecords, updateRecord, vaultRoot } from "./vault";
import { AutoTinkerError, type CanonicalRecord, type Privacy } from "./types";

export interface GoalInput {
  title: string;
  outcome: string;
  success_criteria?: string[];
  horizon?: string;
  priority?: number;
  constraints?: string[];
  target_roles?: string[];
  target_companies?: string[];
  target_topics?: string[];
  exploration_budget?: number;
  body?: string;
  privacy?: Privacy;
}
function goalMetadata(input: GoalInput, isMain: boolean): Record<string, unknown> {
  return {
    is_main: isMain,
    outcome: input.outcome,
    success_criteria: input.success_criteria ?? [],
    horizon: input.horizon ?? "unspecified",
    priority: input.priority ?? 1,
    constraints: input.constraints ?? [],
    target_roles: input.target_roles ?? [],
    target_companies: input.target_companies ?? [],
    target_topics: input.target_topics ?? [],
    exploration_budget: input.exploration_budget ?? 0.2,
  };
}

export async function getGoals(workspace: string): Promise<CanonicalRecord[]> {
  return (await readAllRecords(workspace)).filter((record) => record.frontmatter.type === "goal");
}

export async function getMainGoal(workspace: string): Promise<CanonicalRecord> {
  const goals = await getGoals(workspace);
  const main = goals.filter((goal) => goal.frontmatter.is_main === true && goal.frontmatter.status === "active");
  if (main.length !== 1) {
    throw new AutoTinkerError("INVALID_MAIN_GOAL", `Expected exactly one active main goal, found ${main.length}`, {
      ids: main.map((goal) => goal.frontmatter.id),
    });
  }
  return main[0];
}

export async function setMainGoal(workspace: string, input: GoalInput): Promise<CanonicalRecord> {
  const current = await getMainGoal(workspace);
  return updateRecord(workspace, current.frontmatter.id, {
    title: input.title,
    status: "active",
    privacy: input.privacy ?? "private",
    body: input.body ?? current.body,
    metadata: goalMetadata(input, true),
  });
}

export async function addSupportingGoal(workspace: string, input: GoalInput): Promise<CanonicalRecord> {
  return createRecord(workspace, "goal", {
    title: input.title,
    status: "supporting",
    privacy: input.privacy ?? "private",
    body: input.body ?? input.outcome,
    metadata: goalMetadata(input, false),
  });
}

export async function switchMainGoal(workspace: string, supportingGoalId: string): Promise<{
  main: CanonicalRecord;
  demoted: CanonicalRecord;
}> {
  const [current, goals] = await Promise.all([getMainGoal(workspace), getGoals(workspace)]);
  const selected = goals.find((goal) => goal.frontmatter.id === supportingGoalId);
  if (!selected) throw new AutoTinkerError("GOAL_NOT_FOUND", `Goal ${supportingGoalId} was not found`);
  if (selected.frontmatter.id === current.frontmatter.id) return { main: current, demoted: current };
  if (selected.frontmatter.is_main === true) throw new AutoTinkerError("INVALID_MAIN_GOAL", "Selected goal is already marked main");

  const now = new Date().toISOString();
  const goalsDirectory = path.join(vaultRoot(workspace), "goals");
  const demotedPath = path.join(goalsDirectory, `${current.frontmatter.id}.md`);
  const mainPath = path.join(goalsDirectory, "main.md");
  const demoted: CanonicalRecord = {
    ...current,
    path: demotedPath,
    frontmatter: { ...current.frontmatter, is_main: false, status: "supporting", updated_at: now },
  };
  const main: CanonicalRecord = {
    ...selected,
    path: mainPath,
    frontmatter: { ...selected.frontmatter, is_main: true, status: "active", updated_at: now },
  };

  // Write both destinations before removing the obsolete supporting path. A
  // crash can leave a duplicate file, but never loses either goal; doctor and
  // index validation surface the duplicate for repair.
  await writeMarkdownRecord(demotedPath, demoted);
  await writeMarkdownRecord(mainPath, main);
  if (selected.path && selected.path !== mainPath && selected.path !== demotedPath) await unlink(selected.path);
  return { main, demoted };
}
