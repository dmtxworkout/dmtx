CREATE TYPE "public"."block_kind" AS ENUM('group', 'rest');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('exercise', 'rest');--> statement-breakpoint
ALTER TABLE "workout_items" ALTER COLUMN "exercise_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "kind" "block_kind" DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_items" ADD COLUMN "kind" "item_kind" DEFAULT 'exercise' NOT NULL;