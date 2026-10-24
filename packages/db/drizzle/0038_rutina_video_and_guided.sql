CREATE TYPE "public"."training_mode" AS ENUM('class', 'guided');--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "has_video" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "is_guided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD COLUMN "mode" "training_mode";--> statement-breakpoint
-- Backfill from the old model: a main section with a video had no blocks.
UPDATE "workouts" SET "has_video" = ("video_asset_id" IS NOT NULL);--> statement-breakpoint
UPDATE "workouts" w SET "is_guided" = EXISTS (SELECT 1 FROM "workout_blocks" b WHERE b."workout_id" = w."id" AND b."section" = 'main');--> statement-breakpoint
-- Sessions logged so far: a video rutina was watched, anything else was guided.
UPDATE "workout_logs" l SET "mode" = CASE WHEN w."type" = 'video' THEN 'class'::"training_mode" ELSE 'guided'::"training_mode" END FROM "workouts" w WHERE w."id" = l."workout_id";
