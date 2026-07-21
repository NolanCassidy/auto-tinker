import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("global framing protection", () => {
  it("denies framing on every route with CSP and the legacy fallback", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers!();

    expect(rules).toContainEqual({
      source: "/:path*",
      headers: expect.arrayContaining([
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ]),
    });
  });
});
