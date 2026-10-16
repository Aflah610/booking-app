/** Who made a change: a signed-in staff member, an API key, or the system (both empty). */
export type Actor = { staffId?: string; apiKeyId?: string };

export type AuditEntry = {
  actor: Actor;
  action: string;
  entity: string;
  entityId: string | null;
  details?: Record<string, unknown>;
};
