import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addCandidate,
  appendJournal,
  buildGraphSnapshot,
  completeExperiment,
  createExperiment,
  initializeWorkspace,
  listQueue,
  mergeArtifactLocations,
  nextQueue,
  readAllRecords,
  readRecord,
  rebuildIndex,
  reviewJournalOutput,
  updateExperiment,
  updateLocalMetadata,
  updateQueue,
  updateRecord,
  type LinkedOutput,
} from "../../src/lib/auto-tinker";

const roots: string[] = [];
async function setup(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "auto-tinker-domain-"));
  roots.push(root);
  await initializeWorkspace(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("domain records and derived index", () => {
  it("deduplicates the same artifact locator when only its label changes", () => {
    const merged = mergeArtifactLocations(
      [{
        kind: "local",
        availability: "present",
        device_id: "device-a",
        path: "tinkers/example",
        label: "Old laptop label",
      }],
      [{
        kind: "local",
        availability: "present",
        device_id: "device-a",
        path: "tinkers/example",
        label: "Renamed checkout",
      }],
      "device-a",
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe("Renamed checkout");

    const remotes = mergeArtifactLocations(
      [{ kind: "github", availability: "unverified", uri: "https://github.com/example/project", label: "Upstream" }],
      [{ kind: "github", availability: "present", uri: "https://github.com/example/project", label: "Private remote" }],
    );
    expect(remotes).toHaveLength(1);
    expect(remotes[0]).toMatchObject({ availability: "present", label: "Private remote" });
  });

  it("orders queue by stars then priority and excludes blocked work", async () => {
    const root = await setup();
    const one = await addCandidate(root, { title: "One", summary: "First", goal_contribution: "Direct", distraction_risk: "Low" });
    const two = await addCandidate(root, { title: "Two", summary: "Second", goal_contribution: "Indirect", distraction_risk: "Medium" });
    await updateQueue(root, one.frontmatter.id, { priority: 1, blocked_reason: "waiting" });
    await updateQueue(root, two.frontmatter.id, { priority: 50, starred: true });
    expect((await listQueue(root))[0].frontmatter.candidate_id).toBe(two.frontmatter.id);
    expect((await nextQueue(root))[0].frontmatter.candidate_id).toBe(two.frontmatter.id);
  });

  it("keeps experiment graph nodes when code is missing and indexes locations", async () => {
    const root = await setup();
    const experiment = await createExperiment(root, {
      title: "Unavailable code",
      goal: "Preserve the knowledge record",
      locations: [{ kind: "local", availability: "present", path: "tinkers/missing", device_id: "device-foreign" }],
    });
    const records = await readAllRecords(root);
    const graph = buildGraphSnapshot(records);
    expect(graph.nodes.find((node) => node.id === experiment.frontmatter.id)).toBeTruthy();
    expect(graph.nodes.find((node) => node.kind === "artifact")?.status).toBe("unverified");
    const indexed = await rebuildIndex(root);
    expect(indexed.records).toBe(records.length);
    expect(indexed.graph.nodes.some((node) => node.id === experiment.frontmatter.id)).toBe(true);
  });

  it("requires explicit passing evidence before completion", async () => {
    const root = await setup();
    const experiment = await createExperiment(root, { title: "Verify me", goal: "Prove it" });
    await expect(completeExperiment(root, experiment.frontmatter.id, "Done")).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
    const completed = await completeExperiment(root, experiment.frontmatter.id, "Done", [{ kind: "test", summary: "npm test", status: "pass" }]);
    expect(completed.frontmatter.status).toBe("complete");
  });

  it("keeps four outputs separate and protects private journal approval", async () => {
    const root = await setup();
    const experiment = await createExperiment(root, { title: "Outputs", goal: "Write separately" });
    const privateJournal = await appendJournal(root, { title: "Candid", body: "Private failure notes", experiment_id: experiment.frontmatter.id, kind: "private-journal" });
    const readme = await appendJournal(root, { title: "README", body: "Public-facing technical narrative", experiment_id: experiment.frontmatter.id, kind: "readme" });
    const changelog = await appendJournal(root, { title: "Log", body: "Dated change", experiment_id: experiment.frontmatter.id, kind: "changelog" });
    const story = await appendJournal(root, { title: "Story", body: "First-person story", experiment_id: experiment.frontmatter.id, kind: "public-story" });
    expect(new Set([privateJournal.path, readme.path, changelog.path, story.path]).size).toBe(4);
    expect(privateJournal.frontmatter.privacy).toBe("private");
    await expect(reviewJournalOutput(root, privateJournal.frontmatter.id, "approved")).rejects.toMatchObject({ code: "INVALID_APPROVAL_TARGET" });
    expect((await reviewJournalOutput(root, story.frontmatter.id, "approved")).frontmatter.writing_approval).toBe("approved");
  });

  it("refreshes the parent linked-output timestamp when a journal review is repeated", async () => {
    const root = await setup();
    const experiment = await createExperiment(root, { title: "Repair links", goal: "Keep denormalized output links current" });
    const story = await appendJournal(root, {
      title: "Story",
      body: "Review this independently.",
      experiment_id: experiment.frontmatter.id,
      kind: "public-story",
    });
    const parent = await readRecord(root, experiment.frontmatter.id);
    const stale = (parent.frontmatter.linked_outputs as LinkedOutput[]).map((output) =>
      output.record_id === story.frontmatter.id ? { ...output, updated_at: "2000-01-01T00:00:00.000Z" } : output,
    );
    await updateRecord(root, experiment.frontmatter.id, { metadata: { linked_outputs: stale } });

    // Repeating the already-pending state is the safe repair path for existing
    // stale records; it does not grant writing or repository approval.
    const repaired = await reviewJournalOutput(root, story.frontmatter.id, "pending");
    const repairedParent = await readRecord(root, experiment.frontmatter.id);
    const repairedLink = (repairedParent.frontmatter.linked_outputs as LinkedOutput[]).find(
      (output) => output.record_id === story.frontmatter.id,
    );
    expect(repaired.frontmatter.writing_approval).toBe("pending");
    expect(repairedLink).toMatchObject({
      kind: "public-story",
      record_id: story.frontmatter.id,
      privacy: repaired.frontmatter.privacy,
      updated_at: repaired.frontmatter.updated_at,
    });
    expect(repairedLink?.updated_at).not.toBe("2000-01-01T00:00:00.000Z");

    const approved = await reviewJournalOutput(root, story.frontmatter.id, "approved");
    const approvedParent = await readRecord(root, experiment.frontmatter.id);
    const approvedLinks = (approvedParent.frontmatter.linked_outputs as LinkedOutput[]).filter(
      (output) => output.record_id === story.frontmatter.id,
    );
    expect(approvedLinks).toHaveLength(1);
    expect(approvedLinks[0].updated_at).toBe(approved.frontmatter.updated_at);
  });

  it("separates viewer story review from repository consent", async () => {
    const root = await setup();
    const experiment = await createExperiment(root, { title: "Consent", goal: "Separate gates" });
    await expect(updateLocalMetadata(root, experiment.frontmatter.id, { public_story_review: "approved" })).rejects.toMatchObject({ code: "INVALID_APPROVAL_TARGET" });
    await appendJournal(root, { title: "Story", body: "Review me", experiment_id: experiment.frontmatter.id, kind: "public-story" });
    const reviewed = await updateLocalMetadata(root, experiment.frontmatter.id, { public_story_review: "approved" });
    expect(reviewed.frontmatter.public_story_review).toBe("approved");
    expect(reviewed.frontmatter.repository_publication_approval).toBe("pending");
    await updateExperiment(root, experiment.frontmatter.id, { repo_url: "https://github.com/example/project" });
  });
});
