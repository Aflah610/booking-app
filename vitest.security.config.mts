import path from "node:path";
import { defineConfig } from "vitest/config";

// Network-policy and HTTP-header tests need no database or external requests.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["tests/webhook-destination.test.ts", "tests/security-headers.test.ts", "tests/otp-sender.test.ts"] },
});
