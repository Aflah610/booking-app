import { registeredClientWhere } from "@/features/clients/clients.repository";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, client, service, staff } from "@/db/schema";

export type ReportRange = { from: Date; to: Date; timeZone: string };

export type StatusCounts = { total: number; scheduled: number; completed: number; cancelled: number; noShow: number };
export type ReportDTO = {
  totals: StatusCounts & { noShowByClient: number; noShowByStaff: number; paid: number; paymentPending: number; paymentFailed: number; online: number };
  byService: ({ id: string; name: string } & StatusCounts)[];
  byStaff: ({ id: string; name: string } & StatusCounts)[];
  /** Bookings per local day, oldest first, with empty days filled in by the service. */
  perDay: { date: string; count: number }[];
};

export type ExportRow = {
  reference: number;
  startsAt: Date;
  endsAt: Date;
  service: string;
  staff: string;
  client: string;
  phone: string;
  email: string | null;
  status: string;
  payment: string;
  noShowBy: string | null;
  source: string;
  notes: string | null;
  answers: Record<string, string>;
  amountDuePaise: number | null;
  amountPaidPaise: number | null;
  razorpayPaymentId: string | null;
  paidAt: Date | null;
};

const counts = {
  total: sql<number>`count(*)::int`,
  scheduled: sql<number>`count(*) filter (where ${booking.status} = 'upcoming')::int`,
  completed: sql<number>`count(*) filter (where ${booking.status} = 'completed')::int`,
  cancelled: sql<number>`count(*) filter (where ${booking.status} = 'cancelled')::int`,
  noShow: sql<number>`count(*) filter (where ${booking.status} = 'no_show')::int`,
};

export function createReportsRepository(db: Db) {
  const inRange = (r: ReportRange) => and(gte(booking.startsAt, r.from), lt(booking.startsAt, r.to));

  return {
    async summary(r: ReportRange): Promise<Omit<ReportDTO, "perDay"> & { perDay: Map<string, number> }> {
      const [[totals], byService, byStaff, days] = await Promise.all([
        db
          .select({
            ...counts,
            noShowByClient: sql<number>`count(*) filter (where ${booking.noShowBy} = 'client')::int`,
            noShowByStaff: sql<number>`count(*) filter (where ${booking.noShowBy} = 'staff')::int`,
            paid: sql<number>`count(*) filter (where ${booking.paymentStatus} = 'paid' and ${booking.status} <> 'cancelled')::int`,
            paymentPending: sql<number>`count(*) filter (where ${booking.paymentStatus} = 'pending' and ${booking.status} <> 'cancelled')::int`,
            paymentFailed: sql<number>`count(*) filter (where ${booking.paymentStatus} = 'failed' and ${booking.status} <> 'cancelled')::int`,
            online: sql<number>`count(*) filter (where ${booking.source} = 'web')::int`,
          })
          .from(booking)
          .where(inRange(r)),
        db
          .select({ id: service.id, name: service.name, ...counts })
          .from(booking)
          .innerJoin(service, eq(service.id, booking.serviceId))
          .where(inRange(r))
          .groupBy(service.id, service.name)
          .orderBy(sql`count(*) desc`, asc(service.name)),
        db
          .select({ id: staff.id, name: staff.name, ...counts })
          .from(booking)
          .innerJoin(staff, eq(staff.id, booking.staffId))
          .where(inRange(r))
          .groupBy(staff.id, staff.name)
          .orderBy(sql`count(*) desc`, asc(staff.name)),
        // Cancelled bookings are left out of the daily chart: it shows how busy the diary was.
        db
          .select({
            day: sql<string>`to_char(${booking.startsAt} at time zone ${r.timeZone}, 'YYYY-MM-DD')`,
            n: sql<number>`count(*)::int`,
          })
          .from(booking)
          .where(and(inRange(r), sql`${booking.status} <> 'cancelled'`))
          .groupBy(sql`1`),
      ]);
      return { totals, byService, byStaff, perDay: new Map(days.map((d) => [d.day, d.n])) };
    },

    async exportBookings(r: ReportRange): Promise<ExportRow[]> {
      return db
        .select({
          reference: booking.number,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          service: service.name,
          staff: staff.name,
          client: client.name,
          phone: client.phoneE164,
          email: client.email,
          status: booking.status,
          payment: booking.paymentStatus,
          noShowBy: booking.noShowBy,
          source: booking.source,
          notes: booking.notes,
          answers: booking.formAnswers,
          amountDuePaise: booking.amountPaise,
          amountPaidPaise: sql<number | null>`(select sum(p.amount_paise)::int from payment p where p.booking_id = ${booking.id} and p.status = 'paid')`,
          razorpayPaymentId: sql<string | null>`(select p.razorpay_payment_id from payment p where p.booking_id = ${booking.id} and p.status = 'paid' order by p.paid_at desc limit 1)`,
          paidAt: sql<Date | null>`(select max(p.paid_at) from payment p where p.booking_id = ${booking.id} and p.status = 'paid')`,
        })
        .from(booking)
        .innerJoin(service, eq(service.id, booking.serviceId))
        .innerJoin(staff, eq(staff.id, booking.staffId))
        .innerJoin(client, eq(client.id, booking.clientId))
        .where(inRange(r))
        .orderBy(asc(booking.startsAt))
        .limit(20_000);
    },

    async exportClients() {
      return db
        .select({
          name: client.name,
          phone: client.phoneE164,
          email: client.email,
          whatsappOptIn: client.whatsappOptIn,
          bookings: sql<number>`(select count(*)::int from booking b where b.client_id = ${client.id} and b.status <> 'cancelled')`,
          lastVisit: sql<Date | null>`(select max(b.starts_at) from booking b where b.client_id = ${client.id} and b.status in ('completed'))`,
          notes: client.notes,
          createdAt: client.createdAt,
        })
        .from(client)
        .where(registeredClientWhere())
        .orderBy(asc(client.name))
        .limit(20_000);
    },
  };
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
