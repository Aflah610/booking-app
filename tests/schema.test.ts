import { beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { booking, client, service, staff } from "@/db/schema";

async function fixtures() {
  const [s] = await db.insert(staff).values({ name: "Asha", email: "asha@firm.test" }).returning();
  const [svc] = await db.insert(service).values({ name: "Consult", durationMin: 30 }).returning();
  const [c] = await db.insert(client).values({ name: "Ravi", phoneE164: "+919800000001" }).returning();
  const book = (start: string, end: string, status: "upcoming" | "cancelled" = "upcoming") =>
    db.insert(booking).values({
      staffId: s.id,
      serviceId: svc.id,
      clientId: c.id,
      startsAt: new Date(start),
      endsAt: new Date(end),
      source: "web",
      status,
    }).returning();
  return { s, book };
}

describe("booking overlap guard", () => {
  beforeEach(reset);

  it("rejects a second booking that overlaps for the same staff member", async () => {
    const { book } = await fixtures();
    await book("2026-11-02T09:00Z", "2026-11-02T09:30Z");
    await expect(book("2026-11-02T09:15Z", "2026-11-02T09:45Z")).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: "booking_no_overlap" }),
    });
  });

  it("lets exactly one of 20 simultaneous requests for the same slot win", async () => {
    const { book } = await fixtures();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => book("2026-11-02T11:00Z", "2026-11-02T11:30Z")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("allows back-to-back bookings", async () => {
    const { book } = await fixtures();
    await book("2026-11-02T09:00Z", "2026-11-02T09:30Z");
    await expect(book("2026-11-02T09:30Z", "2026-11-02T10:00Z")).resolves.toHaveLength(1);
  });

  it("ignores cancelled bookings", async () => {
    const { book } = await fixtures();
    await book("2026-11-02T09:00Z", "2026-11-02T09:30Z", "cancelled");
    await expect(book("2026-11-02T09:00Z", "2026-11-02T09:30Z")).resolves.toHaveLength(1);
  });

  it("numbers bookings in order", async () => {
    const { book } = await fixtures();
    const [a] = await book("2026-11-02T09:00Z", "2026-11-02T09:30Z");
    const [b] = await book("2026-11-02T10:00Z", "2026-11-02T10:30Z");
    expect(b.number).toBe(a.number + 1);
  });
});

describe("client phone", () => {
  beforeEach(reset);
  it("must be E.164", async () => {
    await expect(db.insert(client).values({ name: "X", phoneE164: "98000" })).rejects.toThrow();
  });
});
