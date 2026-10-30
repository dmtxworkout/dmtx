-- Free text in the app ignores accents.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
-- The other names people search the muscles by.
UPDATE "muscles" SET "aliases" = '["pecho", "pectorales", "pectoral mayor", "pecs"]'::jsonb WHERE "slug" = 'pectoral';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["serrato", "serratos"]'::jsonb WHERE "slug" = 'serrato-anterior';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["dorsal", "dorsal ancho", "gran dorsal", "lats"]'::jsonb WHERE "slug" = 'dorsales';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["trapecios", "traps"]'::jsonb WHERE "slug" = 'trapecio';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["lumbares", "lumbar", "erectores espinales", "espalda inferior"]'::jsonb WHERE "slug" = 'espalda-baja';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["redondo"]'::jsonb WHERE "slug" = 'redondo-mayor';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["hombro", "deltoides", "deltoide", "delts"]'::jsonb WHERE "slug" = 'hombros';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["deltoide anterior", "hombro anterior", "hombro frontal"]'::jsonb WHERE "slug" = 'deltoides-anterior';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["deltoide lateral", "deltoides medio", "hombro lateral"]'::jsonb WHERE "slug" = 'deltoides-lateral';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["deltoide posterior", "hombro posterior"]'::jsonb WHERE "slug" = 'deltoides-posterior';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["rotadores"]'::jsonb WHERE "slug" = 'manguito-rotador';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["bíceps", "biceps braquial"]'::jsonb WHERE "slug" = 'bicep';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["tríceps"]'::jsonb WHERE "slug" = 'tricep';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["antebrazos", "agarre", "flexores de muñeca", "extensores de muñeca"]'::jsonb WHERE "slug" = 'antebrazo';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["supinador largo"]'::jsonb WHERE "slug" = 'braquiorradial';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["abdomen", "abdominal", "abs"]'::jsonb WHERE "slug" = 'abdominales';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["oblicuo"]'::jsonb WHERE "slug" = 'oblicuos';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["recto del abdomen", "six pack", "cuadritos"]'::jsonb WHERE "slug" = 'recto-abdominal';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["transverso del abdomen", "faja abdominal"]'::jsonb WHERE "slug" = 'transverso-abdominal';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["piso pélvico", "kegel"]'::jsonb WHERE "slug" = 'suelo-pelvico';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["cuads", "muslo anterior"]'::jsonb WHERE "slug" = 'cuadriceps';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["glúteo", "nalgas", "pompis", "glutes"]'::jsonb WHERE "slug" = 'gluteos';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["pantorrillas", "chamorros", "calves"]'::jsonb WHERE "slug" = 'pantorrilla';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["femoral", "isquiotibiales", "isquios", "hamstrings", "muslo posterior"]'::jsonb WHERE "slug" = 'femorales';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["aductor", "ingle", "muslo interno"]'::jsonb WHERE "slug" = 'aductores';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["abductor", "muslo externo"]'::jsonb WHERE "slug" = 'abductores';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["psoas", "iliopsoas"]'::jsonb WHERE "slug" = 'flexores-de-cadera';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["gastrocnemio", "gastrocnemios"]'::jsonb WHERE "slug" = 'gemelos';--> statement-breakpoint
UPDATE "muscles" SET "aliases" = '["tibial", "tibiales", "espinilla"]'::jsonb WHERE "slug" = 'tibial-anterior';
