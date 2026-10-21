import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@dmtx/api-client', '@dmtx/schemas', '@dmtx/auth', '@dmtx/core'],
};

export default config;
