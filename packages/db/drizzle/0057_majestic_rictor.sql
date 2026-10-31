CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."body_figure" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gender" "gender";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "weight_kg" real;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "activity_level" "activity_level";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "body_figure" "body_figure";