import { mutateViewerSettings } from "@/app/api/_adapter";
import { rejectNonLocalApiRequest } from "@/app/api/_local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const rejection = rejectNonLocalApiRequest(request);
  if (rejection) return rejection;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2_048) throw new Error("Request body is too large");
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required");
    const values = body as Record<string, unknown>;
    if (Object.keys(values).some((key) => key !== "autoPublic") || typeof values.autoPublic !== "boolean") {
      throw new Error("Only the boolean autoPublic policy can be changed here");
    }
    const result = await mutateViewerSettings({ autoPublic: values.autoPublic });
    return Response.json({
      ok: true,
      autoPublic: result.record.frontmatter.auto_public,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The setting could not be updated." },
      { status: 400 },
    );
  }
}
