import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^@shared$': '<rootDir>/../shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^sql\\.js/dist/sql-wasm\\.wasm\\?url$': '<rootDir>/src/types/sql-wasm-url.mock.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Override tsconfig settings for Jest compatibility
        module: 'commonjs',
        moduleResolution: 'node',
        allowImportingTsExtensions: false,
        noEmit: false,
        jsx: 'react-jsx',
      },
    }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};

export default config;
