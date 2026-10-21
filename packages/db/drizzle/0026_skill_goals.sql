ALTER TYPE "public"."block_section" ADD VALUE 'goal';--> statement-breakpoint
ALTER TABLE "skill_levels" DROP COLUMN "unlock_goal";--> statement-breakpoint
ALTER TABLE "skill_levels" ADD COLUMN "unlock_goals" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "owner_skill_id" uuid;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_owner_skill_id_skills_id_fk" FOREIGN KEY ("owner_skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
