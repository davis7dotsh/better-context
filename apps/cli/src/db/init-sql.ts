// Auto-generated from drizzle schema - do not edit manually
// Run: bun run db:sync

export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"resources" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"metadata" text NOT NULL,
	"created_at" integer NOT NULL,
	"order" integer NOT NULL,
	FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "idx_questions_thread" ON "questions" ("thread_id");
CREATE TABLE IF NOT EXISTS "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
`;
