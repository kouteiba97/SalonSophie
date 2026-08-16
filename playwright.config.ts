import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    // The primary client is on a mid-range Android phone (§1), so that is the default target.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // The staff console is a desk tool, and running its Suspense-heavy screens against both
      // projects at once starves the single shared `next start`. See the note in atelier.spec.ts.
      testIgnore: /atelier\.spec\.ts/,
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: baseURL,
    /*
     * Never reuse a server we did not start.
     *
     * This was `!process.env.CI`, which quietly reused whatever happened to be on the port —
     * including a `next start` left over from an earlier build. A stale server serves HTML
     * referencing chunk hashes that no longer exist on disk, so every client chunk 404s, nothing
     * hydrates, and every Suspense boundary sits on its fallback forever. The whole suite fails
     * with symptoms that look like application bugs: "the page hangs on its loading skeleton".
     *
     * That cost a long debugging session and produced a bug report for a bug that did not exist.
     * With reuse off, an occupied port is an immediate, obvious error instead. On Windows note
     * that `pkill -f "next start"` does NOT match these processes; use
     *   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ... | Stop-Process
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
