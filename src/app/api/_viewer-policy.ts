import type { RecordFrontmatter } from "@/lib/auto-tinker/types";
import type { ViewerMutation } from "@/components/viewer-types";

const QUEUE_FIELDS = new Set<keyof ViewerMutation>([
  "starred",
  "reviewed",
  "status",
  "rank",
  "scheduledAt",
]);

function hasPublicStoryDraft(frontmatter: RecordFrontmatter) {
  const outputs = Array.isArray(frontmatter.linked_outputs) ? frontmatter.linked_outputs : [];
  return outputs.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const output = value as Record<string, unknown>;
    return output.kind === "public-story" &&
      typeof output.record_id === "string" &&
      output.record_id.length > 0 &&
      output.state !== "missing";
  });
}

export function assertViewerMutationAllowed(frontmatter: RecordFrontmatter, patch: ViewerMutation) {
  const keys = Object.keys(patch) as Array<keyof ViewerMutation>;
  if (keys.some((key) => QUEUE_FIELDS.has(key))) {
    if (frontmatter.type !== "queue-item" && frontmatter.type !== "opportunity") {
      throw new Error("Queue metadata can only be changed on queue items or opportunities");
    }
  }
  if (patch.publicStoryReview !== undefined) {
    if (frontmatter.type !== "experiment") {
      throw new Error("Public-story review can only be changed on an experiment");
    }
    if (patch.publicStoryReview === "approved" && !hasPublicStoryDraft(frontmatter)) {
      throw new Error("Create a public-story draft before marking that draft reviewed");
    }
  }
}

export const viewerPolicyTestHelpers = { hasPublicStoryDraft };
