import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next 15 ships legacy (eslintrc) configs, so they are bridged into flat config
// via FlatCompat. The scaffold's version imported them as flat configs, which only works on 16.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', 'playwright-report/**'],
  },
];

export default eslintConfig;
