/** Worker environment bindings (from wrangler [vars] + .dev.vars secrets). */
export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  TRUSTED_ORIGINS?: string;
  ADMIN_ORIGIN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Mobile app / consumer entitlement
  APP_ORIGIN?: string;
  TRIAL_DAYS?: string;
  DEFAULT_PLAN_AMOUNT_CENTS?: string;
  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
}
