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
  // Cloudflare Images + Stream (media). The token needs Images:Edit and
  // Stream:Edit on the account; the codes come from the dashboard or from
  // `pnpm --filter @dmtx/api cf:setup`.
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  /** Images delivery hash (`imagedelivery.net/<hash>/...`). */
  CF_IMAGES_ACCOUNT_HASH: string;
  /** Stream customer subdomain code (`customer-<code>.cloudflarestream.com`). */
  CF_STREAM_CUSTOMER_CODE: string;
  /** Stream signing key (from POST /stream/keys). Set: videos require signed URLs. */
  CF_STREAM_SIGNING_KEY_ID?: string;
  CF_STREAM_SIGNING_KEY_JWK?: string;
  /** Secret of the Stream webhook (PUT /stream/webhook); unset: the API polls instead. */
  CF_STREAM_WEBHOOK_SECRET?: string;
}
