-- References to library files that were deleted (soft delete) before deletes
-- were refused while a file is in use: the FK's ON DELETE SET NULL never fired.
-- Point them at nothing, as a hard delete would have.
UPDATE "exercises" SET "demo_video_asset_id" = NULL WHERE "demo_video_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "exercises" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "programs" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "workouts" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "workouts" SET "video_asset_id" = NULL WHERE "video_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "workouts" SET "warmup_video_asset_id" = NULL WHERE "warmup_video_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "workouts" SET "cooldown_video_asset_id" = NULL WHERE "cooldown_video_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "equipment" SET "icon_asset_id" = NULL WHERE "icon_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "profiles" SET "avatar_asset_id" = NULL WHERE "avatar_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "collections" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "skills" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
UPDATE "skill_levels" SET "thumbnail_asset_id" = NULL WHERE "thumbnail_asset_id" IN (SELECT "id" FROM "media_assets" WHERE "deleted_at" IS NOT NULL);--> statement-breakpoint
-- The main video may have gone: the flag follows.
UPDATE "workouts" SET "has_video" = ("video_asset_id" IS NOT NULL);
