-- A muscle lights up one part now: the first it had. Suelo pélvico, with none, goes with the abdomen so it stays in Core.
UPDATE "muscles" SET "body_part" = ("body_parts"->>0)::body_part WHERE jsonb_array_length("body_parts") > 0;--> statement-breakpoint
UPDATE "muscles" SET "body_part" = 'abs' WHERE "slug" = 'suelo-pelvico' AND "body_part" IS NULL;--> statement-breakpoint
-- The zone follows from the part (BODY_PART_ZONE).
UPDATE "muscles" SET "zone" = (CASE "body_part"::text
  WHEN 'chest' THEN 'chest'
  WHEN 'deltoids' THEN 'shoulders'
  WHEN 'biceps' THEN 'arms'
  WHEN 'triceps' THEN 'arms'
  WHEN 'forearm' THEN 'arms'
  WHEN 'abs' THEN 'core'
  WHEN 'obliques' THEN 'core'
  WHEN 'trapezius' THEN 'back'
  WHEN 'upper-back' THEN 'back'
  WHEN 'lower-back' THEN 'back'
  ELSE 'legs'
END)::muscle_zone WHERE "body_part" IS NOT NULL;
