-- Media moves from R2 to Cloudflare Images / Stream: what was in R2 is not reachable any more (dev data; references are set null).
DELETE FROM "media_assets";--> statement-breakpoint
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_r2Key_unique";--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "processing_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "processing_status" SET DEFAULT 'uploading'::text;--> statement-breakpoint
DROP TYPE "public"."media_processing_status";--> statement-breakpoint
CREATE TYPE "public"."media_processing_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "processing_status" SET DEFAULT 'uploading'::"public"."media_processing_status";--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "processing_status" SET DATA TYPE "public"."media_processing_status" USING "processing_status"::"public"."media_processing_status";--> statement-breakpoint
ALTER TABLE "media_assets" DROP COLUMN "r2_key";--> statement-breakpoint
ALTER TABLE "media_assets" DROP COLUMN "bucket";--> statement-breakpoint
ALTER TABLE "media_assets" DROP COLUMN "checksum";--> statement-breakpoint
ALTER TABLE "media_assets" DROP COLUMN "variants";--> statement-breakpoint
ALTER TABLE "media_assets" DROP COLUMN "blurhash";