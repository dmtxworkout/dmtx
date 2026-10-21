ALTER TABLE "workouts" ADD COLUMN "variant_of_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "variant_label" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_variant_of_id_workouts_id_fk" FOREIGN KEY ("variant_of_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;