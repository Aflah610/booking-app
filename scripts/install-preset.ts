// Usage: npm run workflow:install -- <preset key> [more keys]   (keys: confirmation, reminder-email, reminder-whatsapp, cancelled ...)
// Adds the ready-made workflows from the Workflows page's cards, skipping any that already exist. Handy on a fresh database.
import { app } from "@/features/container";
import { PRESETS } from "@/features/workflows/presets";

async function main() {
  const keys = process.argv.slice(2);
  if (!keys.length) throw new Error(`Usage: npm run workflow:install -- <key> [key...]. Keys: ${PRESETS.map((p) => p.key).join(", ")}`);
  const existing = new Set((await app().workflows.list()).map((w) => w.name));
  for (const key of keys) {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) throw new Error(`Unknown preset "${key}". Keys: ${PRESETS.map((p) => p.key).join(", ")}`);
    if (existing.has(preset.input.name)) {
      console.log(`Already there: ${preset.input.name}`);
      continue;
    }
    await app().workflows.create({}, preset.input);
    console.log(`Added: ${preset.input.name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
