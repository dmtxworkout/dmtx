ALTER TYPE "public"."block_kind" ADD VALUE 'part';--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "parent_block_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "format" "workout_format";--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD COLUMN "format_config" jsonb;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_parent_block_id_workout_blocks_id_fk" FOREIGN KEY ("parent_block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE cascade ON UPDATE no action;