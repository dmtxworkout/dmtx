-- What each muscle lights up on the drawn body. The drawing has fewer parts than muscles, so some share one; suelo-pelvico has none.
UPDATE "muscles" SET "body_parts" = '["chest"]'::jsonb WHERE "slug" = 'pectoral';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["chest"]'::jsonb WHERE "slug" = 'pectoral-menor';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["obliques"]'::jsonb WHERE "slug" = 'serrato-anterior';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["upper-back"]'::jsonb WHERE "slug" = 'dorsales';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["trapezius"]'::jsonb WHERE "slug" = 'trapecio';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["lower-back"]'::jsonb WHERE "slug" = 'espalda-baja';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["upper-back"]'::jsonb WHERE "slug" = 'romboides';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["upper-back"]'::jsonb WHERE "slug" = 'redondo-mayor';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["deltoids"]'::jsonb WHERE "slug" = 'hombros';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["deltoids"]'::jsonb WHERE "slug" = 'deltoides-anterior';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["deltoids"]'::jsonb WHERE "slug" = 'deltoides-lateral';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["deltoids"]'::jsonb WHERE "slug" = 'deltoides-posterior';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["deltoids"]'::jsonb WHERE "slug" = 'manguito-rotador';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["biceps"]'::jsonb WHERE "slug" = 'bicep';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["triceps"]'::jsonb WHERE "slug" = 'tricep';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["forearm"]'::jsonb WHERE "slug" = 'antebrazo';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["biceps"]'::jsonb WHERE "slug" = 'braquial';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["forearm"]'::jsonb WHERE "slug" = 'braquiorradial';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["abs"]'::jsonb WHERE "slug" = 'abdominales';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["obliques"]'::jsonb WHERE "slug" = 'oblicuos';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["abs"]'::jsonb WHERE "slug" = 'recto-abdominal';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["abs", "obliques"]'::jsonb WHERE "slug" = 'transverso-abdominal';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["lower-back"]'::jsonb WHERE "slug" = 'cuadrado-lumbar';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["quadriceps"]'::jsonb WHERE "slug" = 'cuadriceps';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["gluteal"]'::jsonb WHERE "slug" = 'gluteos';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["calves"]'::jsonb WHERE "slug" = 'pantorrilla';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["hamstring"]'::jsonb WHERE "slug" = 'femorales';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["adductors"]'::jsonb WHERE "slug" = 'aductores';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["gluteal"]'::jsonb WHERE "slug" = 'abductores';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["quadriceps"]'::jsonb WHERE "slug" = 'flexores-de-cadera';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["gluteal"]'::jsonb WHERE "slug" = 'gluteo-medio';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["calves"]'::jsonb WHERE "slug" = 'gemelos';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["calves"]'::jsonb WHERE "slug" = 'soleo';--> statement-breakpoint
UPDATE "muscles" SET "body_parts" = '["tibialis"]'::jsonb WHERE "slug" = 'tibial-anterior';
