CREATE TABLE "workout_muscles" (
	"workout_id" uuid NOT NULL,
	"muscle_id" uuid NOT NULL,
	"role" "muscle_role" NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workout_muscles_workout_id_muscle_id_pk" PRIMARY KEY("workout_id","muscle_id")
);
--> statement-breakpoint
ALTER TABLE "workout_muscles" ADD CONSTRAINT "workout_muscles_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_muscles" ADD CONSTRAINT "workout_muscles_muscle_id_muscles_id_fk" FOREIGN KEY ("muscle_id") REFERENCES "public"."muscles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_muscles_muscle_idx" ON "workout_muscles" USING btree ("muscle_id","workout_id");