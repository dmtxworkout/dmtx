CREATE TYPE "public"."workout_kind" AS ENUM('rutina', 'segment');--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "kind" "workout_kind" DEFAULT 'rutina' NOT NULL;