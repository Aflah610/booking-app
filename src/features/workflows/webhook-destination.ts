import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Only globally routable unicast destinations. IPv4-mapped IPv6 is checked as IPv4 by BlockList.
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(address, prefix, "ipv6");

export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family || blocked.check(address, family === 4 ? "ipv4" : "ipv6")) return false;
  // Exclude unspecified/reserved IPv6 space; mapped IPv4 must also pass the IPv4 block list above.
  return family === 4 || /^2[0-9a-f]{3}:/i.test(address) || /^::ffff:/i.test(address);
}

export function webhookUrl(raw: string): URL {
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      (isIP(hostname) && !publicAddress(hostname))) {
    throw new Error("Use an https:// address on the public internet without credentials or a fragment");
  }
  return url;
}

/** Resolve once, validate every answer, and pin that result to the TLS socket to prevent DNS rebinding. */
export async function postWebhook(raw: string, headers: Record<string, string>, body: string): Promise<void> {
  const url = webhookUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const signal = AbortSignal.timeout(10_000);
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<LookupAddress[]>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Webhook DNS lookup timed out")), { once: true });
        lookup(hostname, { all: true, verbatim: true }).then(resolve, reject);
      });
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((a) => !publicAddress(a.address))) {
    throw new Error("Webhook destination must resolve only to public internet addresses");
  }
  const selected = addresses[0];
  const pinned: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [selected]);
    else callback(null, selected.address, selected.family);
  };
  await new Promise<void>((resolve, reject) => {
    const req = request(url, { method: "POST", headers, lookup: pinned, family: selected.family, agent: false, signal }, (res) => {
      const status = res.statusCode ?? 0;
      res.destroy();
      if (status >= 200 && status < 300) resolve();
      // Node HTTPS does not follow redirects. Do not expose signed URLs in errors or delivery logs.
      else reject(new Error(`Webhook answered HTTP ${status}`));
    });
    req.on("error", reject);
    req.end(body);
  });
}
