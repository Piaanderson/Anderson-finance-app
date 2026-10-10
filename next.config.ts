import type { NextConfig } from "next";
import { securityHeaderList } from "./src/server/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  devIndicators: process.env.PHASE7_SCREENSHOTS === "true" ? false : undefined,
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
