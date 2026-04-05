import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In local dev, proxy /api/* to the Hono Worker running on localhost:8787.
  // In production, Vercel rewrites (vercel.json) handle this at the infra level.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_WORKER_URL ?? "http://localhost:8787"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
