import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import globals from 'globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      '.bundle/**',
      'vendor/**',
      'coverage/**',
      'eslint.config.mjs',
    ],
  },
  ...fixupConfigRules(compat.extends('@react-native')),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
