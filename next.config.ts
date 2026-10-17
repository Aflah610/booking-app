import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (AppSail, AWS or your own server).
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Catalyst's proxy sends "x-forwarded-host: <host>:443" but the browser's Origin has no port, so Next's request-forgery check
      // refuses every form action (sign-in included). These exact addresses (this app, development and production) are allowed.
      allowedOrigins: ["waky-booking-50046919821.development.catalystappsail.in", "waky-booking-50046919821.catalystappsail.in"],
    },
  },
};

export default nextConfig;
