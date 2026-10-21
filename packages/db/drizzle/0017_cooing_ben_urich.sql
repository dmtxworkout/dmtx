ALTER TABLE "workouts" DROP CONSTRAINT "workouts_warmup_workout_id_workouts_id_fk";
--> statement-breakpoint
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_cooldown_workout_id_workouts_id_fk";
--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "format_config";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "warmup_format";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "warmup_format_config";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "cooldown_format";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "cooldown_format_config";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "warmup_workout_id";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN "cooldown_workout_id";