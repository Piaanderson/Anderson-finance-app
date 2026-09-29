import type { NextConfig } from "next";
import { securityHeaderList } from "./src/server/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaderList()
      }
    ];
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
