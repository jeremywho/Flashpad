const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Block root react/react-native only if local copies exist (avoids breaking CI
// where npm hoists everything to root)
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockList = [];
const hasLocalRN = fs.existsSync(path.resolve(projectRoot, 'node_modules/react-native'));
const hasLocalReact = fs.existsSync(path.resolve(projectRoot, 'node_modules/react'));
if (hasLocalRN) {
  blockList.push(new RegExp(`${escapeRegExp(monorepoRoot)}/node_modules/react-native/.*`));
}
if (hasLocalReact) {
  blockList.push(new RegExp(`${escapeRegExp(monorepoRoot)}/node_modules/react/.*`));
}

// Resolve react/react-native from local if available, otherwise root
const rnPath = hasLocalRN
  ? path.resolve(projectRoot, 'node_modules/react-native')
  : path.resolve(monorepoRoot, 'node_modules/react-native');
const reactPath = hasLocalReact
  ? path.resolve(projectRoot, 'node_modules/react')
  : path.resolve(monorepoRoot, 'node_modules/react');

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
    blockList,
    extraNodeModules: {
      'react': reactPath,
      'react-native': rnPath,
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
