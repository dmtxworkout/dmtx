CREATE TABLE "activity_daily_users" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "activity_daily_users_day_metric_key_user_id_pk" PRIMARY KEY("day","metric","key","user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_daily_users" ADD CONSTRAINT "activity_daily_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_daily_users_user_idx" ON "activity_daily_users" USING btree ("user_id");