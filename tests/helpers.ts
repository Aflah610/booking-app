import { sql } from "drizzle-orm";
import { createDb } from "@/db";
import { createContainer } from "@/features/container";

export const testUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/booking_test";
process.env.DATABASE_URL = testUrl;

export const db = createDb(testUrl);
export const c = createContainer(db);

export async function reset() {
  await db.execute(sql`
    truncate audit_log, slot_hold, notification, booking, client_package, package, client, calendar_connection,
      time_off, working_hours, staff_service, service, staff, api_key restart identity cascade`);
}
