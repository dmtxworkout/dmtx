CREATE TABLE "rutina_snippets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
