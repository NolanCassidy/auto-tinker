import { promptForViewer } from "@/app/api/_adapter";
import { rejectNonLocalApiRequest } from "@/app/api/_local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejection = rejectNonLocalApiRequest(request);
  if (rejection) return rejection;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4_096) throw new Error("Request body is too large");
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required");
    const values = body as Record<string, unknown>;
    if (typeof values.action !== "string") throw new Error("A prompt action is required");
    if (values.recordId !== undefined && typeof values.recordId !== "string") throw new Error("recordId must be a string");
    const prompt = await promptForViewer(values.action, values.recordId as string | undefined);
    return Response.json({ prompt }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The prompt could not be generated." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
