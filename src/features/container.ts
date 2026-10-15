import { getDb, type Db } from "@/db";
import { createApiKeysRepository } from "./api-keys/api-keys.repository";
import { createApiKeysService } from "./api-keys/api-keys.service";
import { createAvailabilityRepository } from "./availability/availability.repository";
import { createAvailabilityService } from "./availability/availability.service";
import { createBookingsRepository } from "./bookings/bookings.repository";
import { createBookingsService } from "./bookings/bookings.service";
import { createCatalogRepository } from "./catalog/catalog.repository";
import { createCatalogService } from "./catalog/catalog.service";
import { createClientsRepository } from "./clients/clients.repository";
import { createClientsService } from "./clients/clients.service";
import { createHealthRepository } from "./health/health.repository";
import { createSchedulesRepository } from "./schedules/schedules.repository";
import { createSchedulesService } from "./schedules/schedules.service";
import { createSettingsRepository } from "./settings/settings.repository";
import { createSettingsService } from "./settings/settings.service";
import { createStaffRepository } from "./staff/staff.repository";
import { createStaffService } from "./staff/staff.service";

/**
 * Wires repositories into services. This is the only place that picks the storage
 * implementation, so swapping Postgres for another store means new repositories here.
 */
export function createContainer(db: Db) {
  const staffRepo = createStaffRepository(db);
  const catalogRepo = createCatalogRepository(db);
  const settingsRepo = createSettingsRepository(db);
  const availability = createAvailabilityService({
    availabilityRepo: createAvailabilityRepository(db),
    catalogRepo,
    staffRepo,
    settingsRepo,
  });
  return {
    staff: createStaffService({ staffRepo }),
    catalog: createCatalogService({ catalogRepo }),
    schedules: createSchedulesService({ schedulesRepo: createSchedulesRepository(db) }),
    settings: createSettingsService({ settingsRepo }),
    clients: createClientsService({ clientsRepo: createClientsRepository(db) }),
    availability,
    bookings: createBookingsService({ bookingsRepo: createBookingsRepository(db), availability, settingsRepo }),
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
