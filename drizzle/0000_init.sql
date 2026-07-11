CREATE TABLE "briefs" (
	"date" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"ping" text NOT NULL,
	"html" text NOT NULL,
	"sent_verified_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("briefs"."subject", '') || ' ' || regexp_replace(coalesce("briefs"."html", ''), '<[^>]*>', ' ', 'g'))) STORED
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"claim_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"opened_at" text NOT NULL,
	"expires_at" text,
	"resolved_at" text,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("claims"."payload"->>'predicate', '') || ' ' || coalesce("claims"."payload"->>'data_anchor', ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "forward_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_date" text NOT NULL,
	"payload" jsonb NOT NULL,
	"resolution" jsonb
);
--> statement-breakpoint
CREATE TABLE "panel_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"theme_slug" text NOT NULL,
	"direction" text NOT NULL,
	"evidence" text NOT NULL,
	"trigger_state" text,
	"next_check" text,
	"source" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "theme_events"."evidence")) STORED
);
--> statement-breakpoint
CREATE TABLE "theme_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "theme_state_taken_at_unique" UNIQUE("taken_at")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen" text NOT NULL,
	"last_event_at" text
);
--> statement-breakpoint
ALTER TABLE "theme_events" ADD CONSTRAINT "theme_events_theme_slug_themes_slug_fk" FOREIGN KEY ("theme_slug") REFERENCES "public"."themes"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefs_search_idx" ON "briefs" USING gin ("search");--> statement-breakpoint
CREATE INDEX "claims_search_idx" ON "claims" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "panel_snapshots_kind_taken_at_uq" ON "panel_snapshots" USING btree ("kind","taken_at");--> statement-breakpoint
CREATE INDEX "theme_events_theme_slug_idx" ON "theme_events" USING btree ("theme_slug");--> statement-breakpoint
CREATE INDEX "theme_events_search_idx" ON "theme_events" USING gin ("search");