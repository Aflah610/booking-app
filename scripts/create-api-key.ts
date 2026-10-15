// Usage: npm run api-key:create -- "Website" [scope ...]
// Prints the new key once. Only its hash is stored, so copy it into the website's server env.
import { API_SCOPES, type ApiScope } from "@/features/api-keys/api-keys.dto";
import { app } from "@/features/container";

async function main() {
  const [name, ...rawScopes] = process.argv.slice(2);
  if (!name) throw new Error('Usage: npm run api-key:create -- "<name>" [scopes...]');
  const scopes = (rawScopes.length ? rawScopes : ["website"]) as ApiScope[];
  for (const s of scopes) {
    if (!API_SCOPES.includes(s)) throw new Error(`Unknown scope "${s}". Use one of: ${API_SCOPES.join(", ")}`);
  }
  const { key, record } = await app().apiKeys.create({ name, scopes });
  console.log(`Created API key "${record.name}" (${record.keyPrefix}…) with scopes: ${scopes.join(", ")}`);
  console.log(`\n  ${key}\n`);
  console.log("This is the only time the key is shown.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
