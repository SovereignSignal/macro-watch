-- Producer-assigned revisions so a delayed retry of an older payload can never
-- overwrite a newer correction. `revision` is microseconds since the Unix
-- epoch (exceeds 2^31, hence bigint); 0 marks legacy rows/payloads.
-- claims.original keeps the first-seen prediction fields (immutable); it is
-- NULL for rows stored before this migration.
--
-- Rollback (loses revision guards and the frozen original predictions):
--   ALTER TABLE "claims" DROP COLUMN IF EXISTS "original";
--   ALTER TABLE "claims" DROP COLUMN IF EXISTS "revision";
--   ALTER TABLE "forward_events" DROP COLUMN IF EXISTS "revision";
--   ALTER TABLE "briefs" DROP COLUMN IF EXISTS "revision";
-- After rollback the site overwrites unconditionally again.
ALTER TABLE "briefs" ADD COLUMN IF NOT EXISTS "revision" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "revision" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "original" jsonb;
--> statement-breakpoint
ALTER TABLE "forward_events" ADD COLUMN IF NOT EXISTS "revision" bigint NOT NULL DEFAULT 0;
