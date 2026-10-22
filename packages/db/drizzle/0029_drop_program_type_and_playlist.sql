DROP TABLE "program_items" CASCADE;--> statement-breakpoint
DROP TABLE "program_video_items" CASCADE;--> statement-breakpoint
ALTER TABLE "program_days" DROP COLUMN "week_number";--> statement-breakpoint
ALTER TABLE "program_days" DROP COLUMN "day_of_week";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "duration_days";--> statement-breakpoint
DROP TYPE "public"."program_type";