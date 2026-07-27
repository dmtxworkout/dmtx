import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared flat ESLint config for all TypeScript packages/apps.
 * Usage in a package `eslint.config.js`:
 *   import { baseConfig } from '@dmtx/config/eslint/base';
 *   export default baseConfig;
 */
export const baseConfig = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.next/**',
      '.turbo/**',
      '.wrangler/**',
      'node_modules/**',
      'drizzle/**',
      '**/*.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier,
);

/**
 * Apply to client-side code (admin/mobile) to keep the server-only `@dmtx/db`
 * package out of browser bundles.
 */
export const noServerOnlyImports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@dmtx/db',
            message: '@dmtx/db is server-only. Talk to the API via @dmtx/api-client instead.',
          },
          {
            name: '@dmtx/auth',
            message: 'Server-only entrypoint. Use @dmtx/auth/client on the client.',
          },
        ],
        patterns: [
          {
            group: ['@dmtx/db/*'],
            message: '@dmtx/db is server-only. Use @dmtx/api-client on the client.',
          },
        ],
      },
    ],
  },
};

export default baseConfig;
