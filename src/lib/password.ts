import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt is built into Node (no native add-on to ship to Vercel or AppSail) and is deliberately slow, which is what
// makes guessing a stolen hash expensive. The cost is stored in the hash so it can be raised later without locking anyone out.
const COST = 16384;
const KEY_LEN = 64;

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: cost, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** False for a wrong password and for a malformed hash alike. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), Number(cost));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Hash of a throwaway password, so an unknown email costs the same time as a wrong password and can't be told apart. */
export const decoyHash = hashPassword(randomBytes(12).toString("hex"));
