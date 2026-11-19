-- Aflah (19 Nov 2026): leads go round the coordinators (Lumi, Akhila) in turn; each works and sees only their own.
-- The CCD role works its own leads and no longer sees everyone's. Managers keep "see all" (Akhila starts on her own).
INSERT INTO "role_permission" ("access_role", "permission", "allowed") VALUES
  ('ccd', 'leads.own', true),
  ('ccd', 'leads.all', false)
ON CONFLICT ("access_role", "permission") DO UPDATE SET "allowed" = excluded."allowed", "updated_at" = now();
