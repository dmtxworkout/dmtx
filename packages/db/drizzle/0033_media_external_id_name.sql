ALTER TABLE "media_assets" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_externalId_unique" UNIQUE("external_id");