-- Run inside MCH's Postgres (psql -At -f export.sql > mch-export.json). Prints one JSON document with
-- everything scripts/import-mch.ts copies: staff names, clients, psychologist history, case histories and session notes.
select json_build_object(
  'users', (select coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]') from authentication_user),
  'psychologists', (select coalesce(json_agg(json_build_object('id', id, 'user_id', user_id)), '[]') from authentication_psychologist),
  'clients', (select coalesce(json_agg(c), '[]') from clients_client c),
  'assignments', (select coalesce(json_agg(a), '[]') from clients_clientassignmenthistory a),
  'case_histories', (select coalesce(json_agg(h), '[]') from case_history_casehistory h),
  'session_notes', (select coalesce(json_agg(n), '[]') from case_history_sessionnote n)
);
