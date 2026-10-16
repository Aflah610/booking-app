import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (AppSail, AWS or your own server).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
