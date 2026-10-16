import { getDb, type Db } from "@/db";
import { createApiKeysRepository } from "./api-keys/api-keys.repository";
import { createApiKeysService } from "./api-keys/api-keys.service";
import { createAvailabilityRepository } from "./availability/availability.repository";
import { createAvailabilityService } from "./availability/availability.service";
import type { BookingEvent } from "./bookings/bookings.dto";
import { manageToken } from "./bookings/manage-link";
import { createBookingsRepository } from "./bookings/bookings.repository";
import { createBookingsService } from "./bookings/bookings.service";
import { createCatalogRepository } from "./catalog/catalog.repository";
import { createCatalogService } from "./catalog/catalog.service";
import { createCalendarRepository } from "./calendar/calendar.repository";
import { createCalendarService } from "./calendar/calendar.service";
import { createGoogleProvider } from "./calendar/google";
import type { CalendarProvider } from "./calendar/provider";
import { createClientsRepository } from "./clients/clients.repository";
import { createClientsService } from "./clients/clients.service";
import { createHolidaysRepository } from "./holidays/holidays.repository";
import { createHolidaysService } from "./holidays/holidays.service";
import { createHealthRepository } from "./health/health.repository";
import { createPaymentsRepository } from "./payments/payments.repository";
import { createPaymentsService } from "./payments/payments.service";
import { createReportsRepository } from "./reports/reports.repository";
import { createReportsService } from "./reports/reports.service";
import { createSchedulesRepository } from "./schedules/schedules.repository";
import { createSchedulesService } from "./schedules/schedules.service";
import { createSettingsRepository } from "./settings/settings.repository";
import { createSettingsService } from "./settings/settings.service";
import { createStaffRepository } from "./staff/staff.repository";
import { createStaffService } from "./staff/staff.service";
import { createSenders } from "./workflows/senders";
import { createWorkflowsRepository } from "./workflows/workflows.repository";
import { createWorkflowsService, type Senders } from "./workflows/workflows.service";

/**
 * Wires repositories into services. This is the only place that picks the storage
 * implementation, so swapping Postgres for another store means new repositories here.
 */
export function createContainer(db: Db, opts: { senders?: Senders; manageSecret?: string; appUrl?: string; calendarProvider?: CalendarProvider } = {}) {
  const appUrl = (opts.appUrl ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const manageSecret = opts.manageSecret ?? process.env.AUTH_SECRET;
  const staffRepo = createStaffRepository(db);
  const catalogRepo = createCatalogRepository(db);
  const settingsRepo = createSettingsRepository(db);
  const bookingsRepo = createBookingsRepository(db);
  const availability = createAvailabilityService({
    availabilityRepo: createAvailabilityRepository(db),
    catalogRepo,
    staffRepo,
    settingsRepo,
  });
  const workflows = createWorkflowsService({
    // The client's page for moving or cancelling a booking, for use in messages.
    manageToken: (id) => (manageSecret ? manageToken(id, manageSecret) : null),
    calendarFileUrl: (id) => `${appUrl}/manage/${id}/calendar.ics`,
    manageLink: (id) => (manageSecret ? `${appUrl}/manage/${id}?t=${manageToken(id, manageSecret)}` : null),
    workflowsRepo: createWorkflowsRepository(db),
    catalogRepo,
    settingsRepo,
    senders: opts.senders ?? createSenders(),
  });
  const calendar = createCalendarService({
    calendarRepo: createCalendarRepository(db),
    provider: opts.calendarProvider ?? createGoogleProvider(),
    appUrl,
    secret: process.env.CALENDAR_ENCRYPTION_KEY || manageSecret,
  });
  // Everything that reacts to a booking change. Each listener runs even if another fails.
  const onEvent = async (event: BookingEvent) => {
    const results = await Promise.allSettled([workflows.onBookingEvent(event), calendar.onBookingEvent(event)]);
    for (const r of results) if (r.status === "rejected") console.error(`Listener for booking event ${event.type} failed`, r.reason);
  };
  return {
    staff: createStaffService({ staffRepo }),
    catalog: createCatalogService({ catalogRepo }),
    schedules: createSchedulesService({ schedulesRepo: createSchedulesRepository(db) }),
    settings: createSettingsService({ settingsRepo }),
    clients: createClientsService({ clientsRepo: createClientsRepository(db) }),
    availability,
    bookings: createBookingsService({
      bookingsRepo,
      availability,
      settingsRepo,
      onEvent,
      manageSecret,
    }),
    workflows,
    calendar,
    payments: createPaymentsService({
      paymentsRepo: createPaymentsRepository(db),
      bookingsRepo,
      availability,
      onEvent,
    }),
    reports: createReportsService({ reportsRepo: createReportsRepository(db), settingsRepo }),
    holidays: createHolidaysService({ holidaysRepo: createHolidaysRepository(db) }),
    apiKeys: createApiKeysService({ apiKeysRepo: createApiKeysRepository(db) }),
    health: createHealthRepository(db),
  };
}

export type Container = ReturnType<typeof createContainer>;

const globalForContainer = globalThis as unknown as { container?: Container };

export function app(): Container {
  globalForContainer.container ??= createContainer(getDb());
  return globalForContainer.container;
}
