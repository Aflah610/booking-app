import { beforeEach, describe, expect, it } from "vitest";
import type { AccessRole } from "@/features/access/permissions";
import { createContainer } from "@/features/container";
import type { MetaGraph } from "@/features/whatsapp-connect/whatsapp-connect.dto";
import { db, reset } from "./helpers";

beforeEach(reset);

describe("connecting the WhatsApp leads number", () => {
  it("swaps the code, subscribes the app to the account and remembers the number; admins only", async () => {
    const calls: string[] = [];
    const graph: MetaGraph = {
      exchangeCode: async (code) => { calls.push(`code:${code}`); return "business-token"; },
      subscribeApp: async (waba, token) => { calls.push(`subscribe:${waba}:${token}`); },
    };
    const c = createContainer(db, { metaGraph: graph });
    const admin = await c.staff.create({}, { name: "Ad", email: "ad@firm.test", role: "admin" });
    const sales = await c.staff.create({}, { name: "Bi", email: "bi@firm.test", designation: "Sales Executive" });
    const asViewer = (s: { id: string; accessRole: AccessRole }) => s;
    const input = { code: "code-0123456789", wabaId: "27997481349919392", phoneNumberId: "1391703714022747" };

    await expect(c.whatsappConnect.connect(asViewer(sales), input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.whatsappConnect.connect(asViewer(admin), { ...input, wabaId: "abc" })).rejects.toThrow();
    await c.whatsappConnect.connect(asViewer(admin), input, new Date("2026-10-26T18:00:00Z"));
    expect(calls).toEqual(["code:code-0123456789", "subscribe:27997481349919392:business-token"]);
    expect(await c.whatsappConnect.status()).toEqual({ wabaId: "27997481349919392", phoneNumberId: "1391703714022747", connectedAt: new Date("2026-10-26T18:00:00Z") });
  });
});
