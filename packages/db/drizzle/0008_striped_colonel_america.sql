CREATE TYPE "public"."block_section" AS ENUM('warmup', 'main', 'cooldown');--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "section" "block_section" DEFAULT 'main' NOT NULL;