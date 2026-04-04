const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Escape special regex chars in path
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rootRN = new RegExp(`${escapeRegExp(monorepoRoot)}/node_modules/react-native/.*`);
const rootReact = new RegExp(`${escapeRegExp(monorepoRoot)}/node_modules/react/.*`);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Block the root react-native (0.84) to prevent duplicate modules with local (0.85)
    blockList: [rootRN, rootReact],
    // Ensure single instances of these packages
    extraNodeModules: {
      'react': path.resolve(projectRoot, 'node_modules/react'),
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
    },
  },
  transformer: {
    // Enable minification for better performance
    minifierConfig: {
      keep_classnames: true,
      keep_fnames: true,
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
      output: {
        ascii_only: true,
        quote_style: 3,
        wrap_iife: true,
      },
      sourceMap: {
        includeSources: false,
      },
      toplevel: false,
      compress: {
        reduce_funcs: false,
      },
    },
  },
  // NOTE: Do not override getModulesRunBeforeMainModule - it removes essential
  // polyfills (like performance.now()) that React Native needs at startup
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
