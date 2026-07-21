import { mutateViewerRecord } from "@/app/api/_adapter";
import { rejectNonLocalApiRequest } from "@/app/api/_local-request";
import type { QueueStatus, ViewerMutation } from "@/components/viewer-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set<QueueStatus>([
  "idea",
  "queued",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "archived",
]);

function parsePatch(input: unknown): ViewerMutation {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A JSON object is required");
  const body = input as Record<string, unknown>;
  const allowed = new Set(["starred", "reviewed", "status", "rank", "scheduledAt", "publicStoryReview"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error("The patch contains an unsupported field");
  const patch: ViewerMutation = {};
  if (body.starred !== undefined) {
    if (typeof body.starred !== "boolean") throw new Error("starred must be a boolean");
    patch.starred = body.starred;
  }
  if (body.reviewed !== undefined) {
    if (typeof body.reviewed !== "boolean") throw new Error("reviewed must be a boolean");
    patch.reviewed = body.reviewed;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !statuses.has(body.status as QueueStatus)) throw new Error("Unsupported status");
    patch.status = body.status as QueueStatus;
  }
  if (body.rank !== undefined) {
    if (typeof body.rank !== "number" || !Number.isSafeInteger(body.rank) || body.rank < 1 || body.rank > 10000) throw new Error("rank must be an integer from 1 to 10000");
    patch.rank = body.rank;
  }
  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt !== null && (typeof body.scheduledAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduledAt))) throw new Error("scheduledAt must be YYYY-MM-DD or null");
    patch.scheduledAt = body.scheduledAt as string | null;
  }
  if (body.publicStoryReview !== undefined) {
    if (body.publicStoryReview !== "approved" && body.publicStoryReview !== "pending") throw new Error("Unsupported public-story review state");
    patch.publicStoryReview = body.publicStoryReview;
  }
  if (Object.keys(patch).length === 0) throw new Error("No supported changes were provided");
  return patch;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejection = rejectNonLocalApiRequest(request);
  if (rejection) return rejection;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) throw new Error("Request body is too large");
    const { id } = await params;
    const patch = parsePatch(await request.json());
    const result = await mutateViewerRecord(id, patch);
    return Response.json({
      ok: true,
      updatedAt: result.record.frontmatter.updated_at,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The record could not be updated.";
    const status = /not found/i.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
