import { getViewerSnapshot } from "@/app/api/_adapter";
import { rejectNonLocalApiRequest } from "@/app/api/_local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejection = rejectNonLocalApiRequest(request);
  if (rejection) return rejection;
  try {
    const snapshot = await getViewerSnapshot();
    return Response.json(snapshot, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The local workspace could not be read." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
