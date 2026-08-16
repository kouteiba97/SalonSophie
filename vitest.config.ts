import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    /*
     * Higher than vitest's 5s default because `tests/db` runs real Postgres in WASM (PGlite).
     * Those queries are genuinely slower than a unit test's, and a whole schema's worth of
     * migrations is applied per suite — under load the utilisation queries in atelier.test.ts
     * crossed 5s often enough to fail roughly one run in three.
     *
     * This raises a ceiling, not a floor: a passing test is no slower for it, and a truly hung
     * test still fails, just later.
     */
    testTimeout: 20_000,
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
