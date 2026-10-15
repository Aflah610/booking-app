import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { c, reset } from "./helpers";
import { GET as getServices } from "@/app/api/v1/services/route";
import { GET as getStaffForService } from "@/app/api/v1/staff/route";

beforeEach(reset);

const req = (path: string, key?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });

describe("/api/v1", () => {
  it("requires an API key", async () => {
    const res = await getServices(req("/api/v1/services"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("lists active services only", async () => {
    const { key } = await c.apiKeys.create({ name: "Website", scopes: ["website"] });
    await c.catalog.create({}, { name: "Consult", durationMin: 30, priceDisplay: "₹1,500" });
    await c.catalog.create({}, { name: "Retired", durationMin: 30, active: false });
    const res = await getServices(req("/api/v1/services", key));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      expect.objectContaining({ name: "Consult", durationMin: 30, priceDisplay: "₹1,500" }),
    ]);
    expect(body.data[0]).not.toHaveProperty("bufferBeforeMin");
  });

  it("lists staff for a service without exposing emails", async () => {
    const { key } = await c.apiKeys.create({ name: "Website", scopes: ["website"] });
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30 });
    const a = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setServices({}, a.id, [svc.id]);
    const body = await (await getStaffForService(req(`/api/v1/staff?service=${svc.id}`, key))).json();
    expect(body.data).toEqual([{ id: a.id, name: "Asha", timezone: "Asia/Kolkata" }]);
  });

  it("returns 400 for a bad service id and 404 for an unknown one", async () => {
    const { key } = await c.apiKeys.create({ name: "Website", scopes: ["website"] });
    expect((await getStaffForService(req("/api/v1/staff?service=nope", key))).status).toBe(400);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await getStaffForService(req(`/api/v1/staff?service=${unknown}`, key))).status).toBe(404);
  });
});
