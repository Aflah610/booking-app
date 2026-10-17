import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { c, reset } from "./helpers";
import { GET as getPackages } from "@/app/api/v1/packages/route";
import { POST as purchase } from "@/app/api/v1/packages/[id]/purchase/route";
import { POST as topUp } from "@/app/api/v1/wallet/top-ups/route";
import { GET as getBookings, POST as postBooking } from "@/app/api/v1/bookings/route";
import { zonedToUtc } from "@/lib/time";
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

describe("one call to book, with the package", () => {
  const nextWeek = (time: string, plusDays = 7) => zonedToUtc(`${new Date(Date.now() + plusDays * 86_400_000).toISOString().slice(0, 10)}T${time}`, "Asia/Kolkata").toISOString();
  const bookCall = (key: string, idem: string, body: unknown) =>
    new NextRequest("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idem },
      body: JSON.stringify(body),
    });

  async function withStaff() {
    const base = await setup();
    const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.staff.setServices({}, asha.id, [base.svc.id]);
    await c.schedules.setWeeklyHours({}, asha.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    return { ...base, asha };
  }

  it("books with the client's existing package without being told which", async () => {
    const { key, svc, pkg } = await withStaff();
    await c.packages.purchasePackage({}, pkg.id, { client: { ...ravi, whatsappOptIn: false }, amountPaise: 360000, razorpayPaymentId: "pay_before1" });
    const res = await postBooking(bookCall(key, "idem-aaaaaaaa", { serviceId: svc.id, start: nextWeek("10:00"), client: ravi }), ctx(""));
    expect(res.status).toBe(201);
    expect((await res.json()).data.booking.payment).toMatchObject({ status: "paid", amountPaise: null, action: "none", credit: { credits: 1 } });
  });

  it("buys the package and books in the same call, once, however often it is repeated", async () => {
    const { key, svc, pkg } = await withStaff();
    const body = {
      serviceId: svc.id,
      start: nextWeek("11:00"),
      client: ravi,
      purchase: { packageId: pkg.id, amountPaise: 360000, razorpayPaymentId: "pay_combo1", razorpayOrderId: "order_c1" },
    };
    const first = await postBooking(bookCall(key, "idem-bbbbbbbb", body), ctx(""));
    expect(first.status).toBe(201);
    const data = (await first.json()).data;
    expect(data.purchase.replayed).toBe(false);
    expect(data.booking.payment).toMatchObject({ status: "paid", credit: { credits: 1 } });
    const again = await postBooking(bookCall(key, "idem-bbbbbbbb", body), ctx(""));
    expect(again.status).toBe(200);
    const client = await c.clients.findByPhone("+919876543210");
    const s = await c.packages.summary(client!.id);
    expect(s.packages).toHaveLength(1); // bought once
    expect(s.packages[0].creditsLeft).toBe(3); // used once
  });

  it("books nothing when the purchase amount is wrong", async () => {
    const { key, svc, pkg } = await withStaff();
    const res = await postBooking(
      bookCall(key, "idem-cccccccc", { serviceId: svc.id, start: nextWeek("12:00"), client: ravi, purchase: { packageId: pkg.id, amountPaise: 100, razorpayPaymentId: "pay_bad1" } }),
      ctx(""),
    );
    expect(res.status).toBe(400);
    expect(await c.bookings.list({ view: "all" })).toEqual([]);
  });

  it("keeps the purchase as credit when the time was just taken, so a retry for another time needs no new payment", async () => {
    const { key, svc, pkg } = await withStaff();
    const when = nextWeek("13:00");
    await postBooking(bookCall(key, "idem-dddddddd", { serviceId: svc.id, start: when, client: { ...ravi, phone: "91111 11111" } }), ctx(""));
    const body = { serviceId: svc.id, start: when, client: ravi, purchase: { packageId: pkg.id, amountPaise: 360000, razorpayPaymentId: "pay_race1" } };
    const lost = await postBooking(bookCall(key, "idem-eeeeeeee", body), ctx(""));
    expect(lost.status).toBe(409);
    const retry = await postBooking(bookCall(key, "idem-ffffffff", { ...body, start: nextWeek("14:00") }), ctx(""));
    expect(retry.status).toBe(201);
    expect((await retry.json()).data.purchase.replayed).toBe(true);
    const client = await c.clients.findByPhone("+919876543210");
    expect((await c.packages.summary(client!.id)).packages).toHaveLength(1);
  });
});
