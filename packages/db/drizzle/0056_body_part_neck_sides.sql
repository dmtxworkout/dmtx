ALTER TABLE "muscles" ALTER COLUMN "body_part" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."body_part";--> statement-breakpoint
CREATE TYPE "public"."body_part" AS ENUM('chest', 'deltoids', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'trapezius', 'upper-back', 'lower-back', 'gluteal', 'quadriceps', 'adductors', 'hamstring', 'calves', 'tibialis', 'neck-front', 'neck-back', 'hands', 'feet');--> statement-breakpoint
ALTER TABLE "muscles" ALTER COLUMN "body_part" SET DATA TYPE "public"."body_part" USING "body_part"::"public"."body_part";