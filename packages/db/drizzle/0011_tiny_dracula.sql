ALTER TYPE "public"."subscription_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_userId_unique";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_live_per_user" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" in ('active', 'trialing', 'past_due', 'paused');