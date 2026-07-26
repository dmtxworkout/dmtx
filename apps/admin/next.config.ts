import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@dmtx/api-client', '@dmtx/schemas', '@dmtx/auth'],
};

export default config;
