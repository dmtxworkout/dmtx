// Metro config for a pnpm monorepo + NativeWind.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo (so workspace packages hot-reload).
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. pnpm keeps each package's deps under its own nested node_modules, so
// hierarchical lookup must stay ENABLED (do not disable it) and symlinks
// resolved so Metro can follow the store.
config.resolver.unstable_enableSymlinks = true;

module.exports = withNativeWind(config, { input: './src/global.css' });
