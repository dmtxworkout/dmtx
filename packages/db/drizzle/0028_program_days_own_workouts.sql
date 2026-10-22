ALTER TABLE "workouts" ADD COLUMN "owner_program_id" uuid;--> statement-breakpoint
ALTER TABLE "program_days" ADD COLUMN "workout_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_owner_program_id_programs_id_fk" FOREIGN KEY ("owner_program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;