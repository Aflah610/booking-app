import { getDb, type Db } from "@/db";
import { createApiKeysRepository } from "./api-keys/api-keys.repository";
import { createApiKeysService } from "./api-keys/api-keys.service";
import { createCatalogRepository } from "./catalog/catalog.repository";
import { createCatalogService } from "./catalog/catalog.service";
import { createHealthRepository } from "./health/health.repository";
import { createSchedulesRepository } from "./schedules/schedules.repository";
import { createSchedulesService } from "./schedules/schedules.service";
import { createStaffRepository } from "./staff/staff.repository";
import { createStaffService } from "./staff/staff.service";

/**
 * Wires repositories into services. This is the only place that picks the storage
 * implementation, so swapping Postgres for another store means new repositories here.
 */
export function createContainer(db: Db) {
  return {
    staff: createStaffService({ staffRepo: createStaffRepository(db) }),
    catalog: createCatalogService({ catalogRepo: createCatalogRepository(db) }),
    schedules: createSchedulesService({ schedulesRepo: createSchedulesRepository(db) }),
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
