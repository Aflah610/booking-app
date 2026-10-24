import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (AppSail, AWS or your own server).
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Catalyst's proxy sends "x-forwarded-host: <host>:443" but the browser's Origin has no port, so Next's request-forgery check
      // refuses every form action (sign-in included). These exact addresses (the AWS server, and the old Catalyst ones) are allowed.
      allowedOrigins: [
        "book.mindlap.in",
        "booking-app-50046547819.development.catalystappsail.in",
        "booking-app-50046547819.catalystappsail.in",
        "waky-booking-50046919821.development.catalystappsail.in",
        "waky-booking-50046919821.catalystappsail.in",
      ],
    },
  },
};

export default nextConfig;
