import { describe, expect, it } from "vitest";
import { rejectNonLocalApiRequest } from "../../src/app/api/_local-request";

function request(
  url = "http://127.0.0.1:3000/api/viewer",
  options: { method?: string; host?: string | null; origin?: string; fetchSite?: string; referer?: string } = {},
) {
  const headers = new Headers();
  if (options.host !== null) headers.set("host", options.host ?? "127.0.0.1:3000");
  if (options.origin) headers.set("origin", options.origin);
  if (options.fetchSite) headers.set("sec-fetch-site", options.fetchSite);
  if (options.referer) headers.set("referer", options.referer);
  return new Request(url, { method: options.method ?? "GET", headers });
}

describe("local viewer request boundary", () => {
  it.each([
    ["http://localhost:3000/api/viewer", "localhost:3000"],
    ["http://127.0.0.1:3000/api/viewer", "127.0.0.1:3000"],
    ["http://[::1]:3000/api/viewer", "[::1]:3000"],
  ])("allows loopback authority %s", (url, host) => {
    expect(rejectNonLocalApiRequest(request(url, { host }))).toBeNull();
  });

  it.each(["0.0.0.0:3000", "192.168.1.20:3000", "localhost.example:3000", "localhost:70000"])(
    "rejects non-local or malformed Host %s",
    (host) => {
      expect(rejectNonLocalApiRequest(request(undefined, { host }))?.status).toBe(403);
    },
  );

  it("allows framework-normalized loopback aliases when the port matches", () => {
    expect(
      rejectNonLocalApiRequest(request("http://localhost:3000/api/viewer", { host: "127.0.0.1:3000" })),
    ).toBeNull();
  });

  it("rejects a loopback authority port mismatch", () => {
    expect(
      rejectNonLocalApiRequest(request("http://localhost:3001/api/viewer", { host: "127.0.0.1:3000" }))?.status,
    ).toBe(403);
  });

  it("allows same-origin browser mutations", () => {
    expect(
      rejectNonLocalApiRequest(request(undefined, {
        method: "PATCH",
        origin: "http://127.0.0.1:3000",
        fetchSite: "same-origin",
      })),
    ).toBeNull();
  });

  it.each(["https://evil.example", "http://localhost:3000", "null"])(
    "rejects a cross-origin mutation from %s",
    (origin) => {
      expect(rejectNonLocalApiRequest(request(undefined, { method: "PATCH", origin }))?.status).toBe(403);
    },
  );

  it("allows local CLI mutations without browser provenance headers", () => {
    expect(rejectNonLocalApiRequest(request(undefined, { method: "POST" }))).toBeNull();
  });

  it("rejects cross-site mutation provenance even when Origin is stripped", () => {
    expect(
      rejectNonLocalApiRequest(request(undefined, { method: "POST", fetchSite: "cross-site" }))?.status,
    ).toBe(403);
  });

  it("rejects a remote Referer on an Origin-less mutation", () => {
    expect(
      rejectNonLocalApiRequest(request(undefined, { method: "POST", referer: "https://evil.example/form" }))?.status,
    ).toBe(403);
  });
});
