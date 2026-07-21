import { describe, expect, it } from "vitest";
import type { RecordFrontmatter } from "../../src/lib/auto-tinker/types";
import { assertViewerMutationAllowed } from "../../src/app/api/_viewer-policy";

function frontmatter(type: RecordFrontmatter["type"], extra: Record<string, unknown> = {}): RecordFrontmatter {
  return {
    id: `${type}-test`,
    type,
    title: "Test record",
    status: "active",
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:00:00.000Z",
    privacy: "private",
    confidence: 1,
    tags: [],
    links: [],
    source_refs: [],
    ...extra,
  };
}

describe("viewer mutation policy", () => {
  it("limits queue controls to queue records", () => {
    expect(() => assertViewerMutationAllowed(frontmatter("queue-item"), { rank: 2 })).not.toThrow();
    expect(() => assertViewerMutationAllowed(frontmatter("experiment"), { rank: 2 })).toThrow(/Queue metadata/);
  });

  it("reviews only an existing public-story draft", () => {
    const experiment = frontmatter("experiment", {
      linked_outputs: [{ kind: "public-story", record_id: "journal-public-story", privacy: "review", state: "draft" }],
    });
    expect(() => assertViewerMutationAllowed(experiment, { publicStoryReview: "approved" })).not.toThrow();
    expect(() => assertViewerMutationAllowed(frontmatter("experiment"), { publicStoryReview: "approved" })).toThrow(/public-story draft/);
    expect(() => assertViewerMutationAllowed(frontmatter("journal"), { publicStoryReview: "approved" })).toThrow(/experiment/);
  });
});
