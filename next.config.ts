import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep tracing and file watching inside this public product repository even
  // when a developer has unrelated package-lock files higher in their home.
  turbopack: {
    root: import.meta.dirname,
  },
  // A clone is also a private local workspace. Runtime records must never be
  // copied into a Next.js server trace or standalone deployment artifact.
  outputFileTracingExcludes: {
    "/*": [
      "./.auto-tinker/**/*",
      "./tinkers/**/*",
      "./tasks/**/*",
      "./private/**/*",
      "./.git/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
