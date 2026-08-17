CREATE TABLE "research_memos" (
	"date" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"finding" text NOT NULL,
	"changed" text NOT NULL,
	"decision" text NOT NULL,
	"watch" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("topic", '') || ' ' || coalesce("finding", '') || ' ' || coalesce("changed", '') || ' ' || coalesce("decision", '') || ' ' || coalesce("watch", ''))) STORED
);
--> statement-breakpoint
CREATE INDEX "research_memos_search_idx" ON "research_memos" USING gin ("search");
