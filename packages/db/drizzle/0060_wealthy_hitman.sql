CREATE TABLE "activity_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_daily_day_metric_key_pk" PRIMARY KEY("day","metric","key")
);
--> statement-breakpoint
CREATE INDEX "activity_events_created_brin" ON "activity_events" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "workout_logs_created_brin" ON "workout_logs" USING brin ("created_at");