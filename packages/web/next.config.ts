import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The route handler at src/app/api/[[...path]]/route.ts proxies all /api/*
  // requests to the API Worker (CF Worker) in both dev and production.
  // No rewrites needed here.
};

export default nextConfig;
