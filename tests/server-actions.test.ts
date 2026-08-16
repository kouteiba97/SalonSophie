import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `'use server'` file may export async functions, and nothing else.
 *
 * This exists because of a bug that shipped and stayed invisible. `management.ts` exported an
 * unused `managementIdleState` **object** alongside its actions. Next builds a client-callable
 * entry from every export of a `'use server'` module, and a non-function among them throws
 *
 *   A "use server" file can only export async functions, found object.
 *
 * at **request time** — not at build time. Typecheck passed, lint passed, `next build` passed,
 * and 314 tests passed, while every write on that file answered 500: the tariff, the opening
 * hours, products, stock and spending. It presented as a broken screen rather than a broken
 * export, and it was found by hand, by submitting a form.
 *
 * An end-to-end test would also have caught it, but only on the screens someone remembered to
 * drive, and only while signed in. This catches the whole class, for every action file, in
 * milliseconds and with no browser — so the next constant somebody parks beside an action fails
 * here instead of in front of reception.
 *
 * Deliberately a source check rather than an import: importing a `'use server'` module outside
 * Next's compiler gives you the plain module, where the illegal export looks perfectly fine.
 * The rule being enforced is about the *file*, so the file is what gets read.
 */

const ACTIONS_DIR = join(process.cwd(), 'src/app/actions');

/** `export const X`, `export { X }`, `export default …` — anything that is not an async function. */
const EXPORT_LINE = /^export\b/;
const ASYNC_FUNCTION = /^export\s+async\s+function\s/;
/** Type-only exports are erased before the compiler ever sees them, so they are always fine. */
const TYPE_ONLY = /^export\s+(type|interface)\s/;

function actionFiles(): string[] {
  return readdirSync(ACTIONS_DIR).filter((name) => name.endsWith('.ts'));
}

describe("'use server' files", () => {
  const files = actionFiles();

  it('there are some to check', () => {
    // Guards against the directory moving and this suite silently passing on an empty list.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const source = readFileSync(join(ACTIONS_DIR, file), 'utf8');
    const isServerFile = /^['"]use server['"]/m.test(source);

    it(`${file} exports only async functions`, () => {
      if (!isServerFile) return;

      const offenders = source
        .split(/\r?\n/)
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter(({ line }) => EXPORT_LINE.test(line))
        .filter(({ line }) => !ASYNC_FUNCTION.test(line) && !TYPE_ONLY.test(line));

      expect(
        offenders.map((o) => `${file}:${o.number} ${o.line}`),
        `a "use server" file may only export async functions — move constants to src/lib/`,
      ).toEqual([]);
    });
  }
});
