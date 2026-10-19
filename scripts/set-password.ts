// Usage: STAFF_PASSWORD='...' npm run staff:set-password -- <email> [--create]
// Sets the password a staff member signs in with. With --create, an email that is not staff yet is added as an admin.
// The password comes from the environment (never the command line, which shell history keeps) and is stored only as a hash.
import { app } from "@/features/container";

async function main() {
  const [rawEmail, flag] = process.argv.slice(2);
  const password = process.env.STAFF_PASSWORD;
  if (!rawEmail || !password) throw new Error("Usage: STAFF_PASSWORD='...' npm run staff:set-password -- <email> [--create]");
  const email = rawEmail.trim().toLowerCase();
  const actor = {};
  let member = (await app().staff.list()).find((s) => s.email.toLowerCase() === email);
  if (!member) {
    if (flag !== "--create") throw new Error(`No staff member with email ${email}. Add --create to create an admin.`);
    member = await app().staff.create(actor, { name: email.split("@")[0], email, role: "admin" });
    console.log(`Created admin ${email}`);
  }
  await app().staff.setPassword(actor, member.id, password);
  console.log(`Password set for ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
