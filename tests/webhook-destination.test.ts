import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
import type { RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";

const { dns, https } = vi.hoisted(() => ({ dns: vi.fn(), https: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: dns }));
vi.mock("node:https", () => ({ request: https }));
import { postWebhook, publicAddress, webhookUrl } from "@/features/workflows/webhook-destination";

beforeEach(() => { vi.resetAllMocks(); });

it.each(["127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a00:1", "2002:7f00:1::", "64:ff9b::7f00:1"])("blocks non-public address %s", (address) => {
  expect(publicAddress(address)).toBe(false);
});
it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows globally routable address %s", (address) => {
  expect(publicAddress(address)).toBe(true);
});
it.each(["http://localhost/x", "https://127.1/x", "https://2130706433/x", "https://[::ffff:127.0.0.1]/x", "https://user:pass@example.com/x", "https://example.com/#fragment"])("refuses unsafe saved URL %s", (url) => {
  expect(() => webhookUrl(url)).toThrow();
});
it("refuses private and mixed DNS responses before any connection", async () => {
  for (const addresses of [[], [{ address: "10.0.0.1", family: 4 }], [{ address: "8.8.8.8", family: 4 }, { address: "::1", family: 6 }]]) {
    dns.mockResolvedValue(addresses);
    await expect(postWebhook("https://hooks.example.com/x", {}, "{}")).rejects.toThrow(/public/);
  }
  expect(https).not.toHaveBeenCalled();
});
it("pins the validated DNS result into the TLS connection and preserves hostname verification", async () => {
  dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  let options: RequestOptions;
  https.mockImplementation((url: URL, opts: RequestOptions, response: (res: IncomingMessage) => void) => {
    expect(url.hostname).toBe("hooks.example.com");
    options = opts;
    const req = new EventEmitter();
    return Object.assign(req, { end: () => response({ statusCode: 204, destroy: vi.fn() } as unknown as IncomingMessage) });
  });
  await postWebhook("https://hooks.example.com/x", { "X-Signature": "synthetic" }, "{}");
  expect(options!.agent).toBe(false);
  const callback = vi.fn();
  options!.lookup!("hooks.example.com", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  expect(dns).toHaveBeenCalledTimes(1);
});
it("refuses redirects without contacting the redirect target", async () => {
  dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  https.mockImplementation((_url: URL, _opts: RequestOptions, response: (res: IncomingMessage) => void) => {
    const req = new EventEmitter();
    return Object.assign(req, { end: () => response({ statusCode: 302, destroy: vi.fn() } as unknown as IncomingMessage) });
  });
  await expect(postWebhook("https://hooks.example.com/x", {}, "{}")).rejects.toThrow("HTTP 302");
  expect(https).toHaveBeenCalledTimes(1);
});
