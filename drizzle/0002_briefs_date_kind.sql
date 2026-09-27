-- Key briefs on (date, kind) so a daily and a week-ahead on the same date
-- can both be stored. Existing rows are kept. `date` was unique, so
-- (date, kind) is unique for every row already in the table.
--
-- Rollback, only when each date has a single kind:
--   ALTER TABLE "briefs" DROP CONSTRAINT "briefs_date_kind_pk";
--   ALTER TABLE "briefs" ADD CONSTRAINT "briefs_pkey" PRIMARY KEY ("date");
-- If two kinds share a date, delete or merge the extra row first. After
-- rollback the site overwrites across kinds on that date again.
DO $$
DECLARE
  pk name;
BEGIN
  SELECT conname INTO pk
  FROM pg_constraint
  WHERE conrelid = 'public.briefs'::regclass
    AND contype = 'p';
  IF pk IS NOT NULL AND pk <> 'briefs_date_kind_pk' THEN
    EXECUTE format('ALTER TABLE briefs DROP CONSTRAINT %I', pk);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.briefs'::regclass
      AND conname = 'briefs_date_kind_pk'
  ) THEN
    ALTER TABLE briefs ADD CONSTRAINT briefs_date_kind_pk PRIMARY KEY (date, kind);
  END IF;
END $$;
