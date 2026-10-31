-- Accounts from before the email code keep working; only new sign-ups are asked for it.
UPDATE "user" SET "email_verified" = true;
