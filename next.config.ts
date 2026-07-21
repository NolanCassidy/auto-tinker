import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep tracing and file watching inside this public product repository even
  // when a developer has unrelated package-lock files higher in their home.
  turbopack: {
    root: import.meta.dirname,
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
