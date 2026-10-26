CREATE TYPE "public"."muscle_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."muscle_zone" AS ENUM('chest', 'back', 'shoulders', 'arms', 'core', 'legs');--> statement-breakpoint
ALTER TABLE "goal_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_goal_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_muscles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_muscles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "goal_tags" CASCADE;--> statement-breakpoint
DROP TABLE "program_goal_tags" CASCADE;--> statement-breakpoint
DROP TABLE "program_muscles" CASCADE;--> statement-breakpoint
DROP TABLE "skill_muscles" CASCADE;--> statement-breakpoint
ALTER TABLE "muscles" ADD COLUMN "zone" "muscle_zone";--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "full_body" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "exercise_muscles_muscle_idx" ON "exercise_muscles" USING btree ("muscle_id");--> statement-breakpoint
CREATE INDEX "workout_blocks_workout_idx" ON "workout_blocks" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "workout_items_block_idx" ON "workout_items" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "workout_items_exercise_idx" ON "workout_items" USING btree ("exercise_id");--> statement-breakpoint
-- Existing muscles go to their zone; the ones the zones were missing are added.
UPDATE "muscles" SET "zone" = CASE
  WHEN lower("name") IN ('pectoral', 'pecho') THEN 'chest'::muscle_zone
  WHEN lower("name") IN ('tricep', 'triceps', 'tríceps', 'bicep', 'biceps', 'bíceps', 'antebrazo') THEN 'arms'::muscle_zone
  WHEN lower("name") IN ('abdominales', 'oblicuos', 'core') THEN 'core'::muscle_zone
  WHEN lower("name") IN ('cuádriceps', 'cuadriceps', 'glúteos', 'gluteos', 'pantorrilla', 'femorales', 'pierna') THEN 'legs'::muscle_zone
  WHEN lower("name") IN ('dorsales', 'trapecio', 'espalda', 'espalda baja') THEN 'back'::muscle_zone
  WHEN lower("name") IN ('hombros', 'hombro', 'deltoides') THEN 'shoulders'::muscle_zone
END;--> statement-breakpoint
INSERT INTO "muscles" ("id", "slug", "name", "zone", "position")
SELECT gen_random_uuid(), v.slug, v.name, v.zone::muscle_zone, (SELECT coalesce(max("position"), 0) FROM "muscles") + v.n
FROM (VALUES
  ('hombros', 'Hombros', 'shoulders', 1),
  ('dorsales', 'Dorsales', 'back', 2),
  ('trapecio', 'Trapecio', 'back', 3),
  ('espalda-baja', 'Espalda baja', 'back', 4),
  ('antebrazo', 'Antebrazo', 'arms', 5),
  ('oblicuos', 'Oblicuos', 'core', 6),
  ('femorales', 'Femorales', 'legs', 7)
) AS v(slug, name, zone, n)
WHERE NOT EXISTS (SELECT 1 FROM "muscles" m WHERE m."slug" = v.slug OR lower(m."name") = lower(v.name));
