import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
