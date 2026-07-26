import nextPlugin from '@next/eslint-plugin-next';
import { baseConfig, noServerOnlyImports } from './base.js';

/**
 * Flat ESLint config for the Next.js admin app.
 * Usage in `apps/admin/eslint.config.js`:
 *   import nextConfig from '@dmtx/config/eslint/next';
 *   export default nextConfig;
 */
export const nextConfig = [
  ...baseConfig,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  noServerOnlyImports,
];

export default nextConfig;
