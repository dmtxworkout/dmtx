ALTER TABLE "exercises" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
UPDATE "exercises" SET "archived_at" = now() WHERE "status" = 'archived';--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "status";
