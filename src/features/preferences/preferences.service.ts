import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import type { PreferencesRepository } from "./preferences.repository";

const KEY = /^[a-z][a-z0-9_.]{0,60}$/;

/** A person's own saved screen settings. Nobody can read or change another person's. */
export function createPreferencesService(deps: { preferencesRepo: PreferencesRepository }) {
  const { preferencesRepo } = deps;
  const check = (staffId: string, key: string) => {
    if (!isUuid(staffId)) throw new DomainError("not_found", `Staff member ${staffId} not found`);
    if (!KEY.test(key)) throw new DomainError("invalid", `"${key}" is not a valid setting name`);
  };
  return {
    async get(staffId: string, key: string): Promise<unknown | null> {
      check(staffId, key);
      return preferencesRepo.get(staffId, key);
    },
    async set(staffId: string, key: string, value: unknown) {
      check(staffId, key);
      await preferencesRepo.set(staffId, key, value);
    },
    async reset(staffId: string, key: string) {
      check(staffId, key);
      await preferencesRepo.remove(staffId, key);
    },
  };
}

export type PreferencesService = ReturnType<typeof createPreferencesService>;
