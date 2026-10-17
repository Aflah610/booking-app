import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { c, reset } from "./helpers";
import { GET as getPackages } from "@/app/api/v1/packages/route";
import { POST as purchase } from "@/app/api/v1/packages/[id]/purchase/route";
import { POST as topUp } from "@/app/api/v1/wallet/top-ups/route";
import { GET as getBookings } from "@/app/api/v1/bookings/route";
import { GET as getQuote } from "@/app/api/v1/credits/quote/route";
import { GET as getCredits } from "@/app/api/v1/credits/route";

beforeEach(reset);

const call = (method: string, path: string, key?: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ravi = { name: "Ravi Kumar", phone: "98765 43210", email: "ravi@example.com" };

async function setup() {
  const { key } = await c.apiKeys.create({ name: "Website", scopes: ["website"] });
  const svc = await c.catalog.create({}, { name: "Counselling", durationMin: 60, priceDisplay: "1000" });
  const pkg = await c.packages.create({}, { name: "4 credits", serviceIds: [svc.id], sessions: 4, pricePaise: 360000 });
  return { key, svc, pkg };
}

describe("website credit endpoints", () => {
  it("need an API key", async () => {
    expect((await getPackages(call("GET", "/api/v1/packages"), ctx(""))).status).toBe(401);
  });

  it("list packages, take a purchase once, and show the credit", async () => {
    const { key, svc, pkg } = await setup();
    const list = await (await getPackages(call("GET", "/api/v1/packages", key), ctx(""))).json();
    expect(list.data).toEqual([expect.objectContaining({ id: pkg.id, credits: 4, pricePaise: 360000, perCreditPaise: 90000 })]);

    const body = { client: ravi, amountPaise: 360000, razorpayPaymentId: "pay_abc123", razorpayOrderId: "order_1" };
    const first = await purchase(call("POST", `/api/v1/packages/${pkg.id}/purchase`, key, body), ctx(pkg.id));
    expect(first.status).toBe(201);
    expect((await first.json()).data).toMatchObject({ kind: "package", replayed: false, credit: { totalPaise: 360000, credits: 4 } });
    const again = await purchase(call("POST", `/api/v1/packages/${pkg.id}/purchase`, key, body), ctx(pkg.id));
    expect(again.status).toBe(200);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");

    const credits = await (await getCredits(call("GET", "/api/v1/credits?phone=9876543210", key), ctx(""))).json();
    expect(credits.data).toMatchObject({ totalPaise: 360000, packages: [expect.objectContaining({ creditsLeft: 4, creditValuePaise: 100000 })] });
    const quote = await (await getQuote(call("GET", `/api/v1/credits/quote?phone=9876543210&serviceId=${svc.id}`, key), ctx(""))).json();
    expect(quote.data).toMatchObject({ pricePaise: 100000, creditsUsed: 1, duePaise: 0, covered: true });
  });

  it("answer 400 with the expected amount when the amount is wrong", async () => {
    const { key, pkg } = await setup();
    const res = await purchase(call("POST", `/api/v1/packages/${pkg.id}/purchase`, key, { client: ravi, amountPaise: 1, razorpayPaymentId: "pay_x1" }), ctx(pkg.id));
    expect(res.status).toBe(400);
  });

  it("top up the wallet", async () => {
    const { key } = await setup();
    const res = await topUp(call("POST", "/api/v1/wallet/top-ups", key, { client: ravi, amountPaise: 500000, razorpayPaymentId: "pay_w1" }), ctx(""));
    expect(res.status).toBe(201);
    expect((await res.json()).data.credit).toMatchObject({ walletPaise: 500000, totalPaise: 500000 });
  });

  it("list a client's bookings by view, and reject an unknown view", async () => {
    const { key } = await setup();
    const ok = await getBookings(call("GET", "/api/v1/bookings?phone=9876543210&view=upcoming", key), ctx(""));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual([]);
    expect((await getBookings(call("GET", "/api/v1/bookings?phone=9876543210&view=weird", key), ctx(""))).status).toBe(400);
  });
});
