CREATE TABLE "set_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workout_log_id" uuid NOT NULL,
	"exercise_id" uuid,
	"exercise_name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"round" integer,
	"set_number" integer,
	"measure" "measurement_type",
	"reps" integer,
	"seconds" integer,
	"distance_meters" integer,
	"load_kg" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workout_id" uuid,
	"workout_name" text NOT NULL,
	"format" "workout_format",
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_seconds" integer,
	"rounds_completed" integer,
	"total_volume" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_results" ADD CONSTRAINT "set_results_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_results" ADD CONSTRAINT "set_results_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_results_log_idx" ON "set_results" USING btree ("workout_log_id");--> statement-breakpoint
CREATE INDEX "workout_logs_user_idx" ON "workout_logs" USING btree ("user_id","created_at");