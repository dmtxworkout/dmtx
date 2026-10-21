ALTER TABLE "muscles" DROP CONSTRAINT "muscles_muscle_group_id_muscle_groups_id_fk";--> statement-breakpoint
ALTER TABLE "muscles" DROP COLUMN "muscle_group_id";--> statement-breakpoint
DROP TABLE "muscle_groups" CASCADE;
