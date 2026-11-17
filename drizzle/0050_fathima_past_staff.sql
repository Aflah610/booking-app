-- Aflah (17 Nov 2026): Fathima Sidhyc has left now, not after her last session. Past staff: she can't sign in or be
-- booked; her history stays. Her remaining booking (BK-00061, 22 Nov) is for CCD to move to another psychologist.
UPDATE "staff" SET "active" = false WHERE "name" = 'Fathima Sidhyc';
