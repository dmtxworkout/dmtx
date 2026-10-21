DELETE FROM "workouts" WHERE "kind" = 'segment';--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "kind";--> statement-breakpoint
DROP TYPE "public"."workout_kind";