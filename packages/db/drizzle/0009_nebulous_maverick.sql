ALTER TABLE "workouts" ADD COLUMN "warmup_workout_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "cooldown_workout_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_warmup_workout_id_workouts_id_fk" FOREIGN KEY ("warmup_workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_cooldown_workout_id_workouts_id_fk" FOREIGN KEY ("cooldown_workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;