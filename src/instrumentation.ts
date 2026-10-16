// Runs once when the server starts. Missing settings are logged loudly instead of crashing every request,
// so the health check can still say what's wrong on hosts where logs are hard to reach.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { missingEnv } = await import("@/lib/env");
    const missing = missingEnv();
    if (missing.length) console.error(`[config] Missing or invalid environment variables: ${missing.join(", ")}`);
  }
}
