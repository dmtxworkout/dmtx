ALTER TABLE "workouts" ADD COLUMN "warmup_format" "workout_format";--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "warmup_format_config" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "cooldown_format" "workout_format";--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "cooldown_format_config" jsonb;