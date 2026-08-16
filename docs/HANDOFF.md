# Handoff — resume here

Last worked: **16 August 2026**, at commit `355f447`. Everything is pushed to `main`.
Working tree clean; nothing is half-finished on disk.

This file says **where the work stopped and what comes next**. It does not repeat the README
(how the repo is laid out, how to run it) or `CLAUDE.md` (the rules). Read this first, then
those two.

---

## Getting a second machine running

```bash
git clone https://github.com/kouteiba97/SalonSophie.git
cd SalonSophie
npm install
npm run dev
```

That is genuinely all. There is **no `.env` to recreate** and no database to connect — the app
reads its catalogue from a committed seed when Supabase is absent, so a fresh clone shows a
client the real tariff on first run. Node 20+.

To look at the staff console, create `.env.local` with one line:

```
NEXT_PUBLIC_DEMO_DATA=1
```

Sign-in is bypassed and the console fills with example records. **Delete it before
`npm run e2e`** — see the trap list below.

Verify the checkout is sound:

```bash
npm run typecheck && npm run lint && npm test
```

Expect **314 tests across 17 files**, green. They need no database and no network: the database
tests run the real migration files against real Postgres compiled to WASM.

---

## What state the project is in

Phases 1–6 of `BUILD_BRIEF.md` are complete. **Phase 7 is not in the brief** — it comes from a
direct instruction to turn the console into something the sisters run the whole business from:
add, update and delete anything; track products and stock; follow the money and see which of the
three businesses earns most.

Phase 7 is being built in waves. Three have landed.

| Wave | What | State |
|---|---|---|
| 1 | Inventory, expenses and reporting schema | **Done** — `20260816090000`, `20260816090100` |
| 2 | Editable tariff + opening hours (`/prestations`) | **Done** — `20260816090200` |
| 3 | Console booking — reception can finally book | **Done** — `20260816090300` |
| 4 | **Stock screen** — products and accessories, in and out | **Next** |
| 5 | Finances screen — money flow, per-line comparison | Pending |
| 6 | Test pass, translation sweep, full verification | Pending |

### What waves 1–3 actually put in the repo

**Database** — four new migrations. `suppliers`, `products`, `stock_movements`, `expenses`, and
a `product_stock` view. Six reporting functions: `revenue_by_line`, `cash_flow`,
`service_performance`, `expense_summary`, `stock_alerts`, `data_gaps`. Management RPCs for
services, categories, hours, products, stock and expenses. Then `search_clients` and
`book_appointment_as_staff`.

Stock is **derived from signed movements**, never a stored counter — a counter and a history
that disagree is a bug you cannot untangle six months later. A check constraint ties the sign to
the reason, so a "delivery" cannot decrease stock.

**Server actions** — `src/app/actions/management.ts` (catalogue, hours, products, stock,
expenses) and `src/app/actions/appointments.ts` (console booking, client search).

**Screens** — `/prestations` became editable (prices, categories, opening hours, owner-only).
`/aujourdhui` gained the four-step **New appointment** modal.

**Tests** — `tests/db/management.test.ts` (19) and `tests/db/staff-booking.test.ts` (12) join the
existing suites.

---

## Wave 4 — start here

Build the **Stock screen**. It closes the second of the two gaps §13 lists that nothing covers
yet. The database layer already exists and is tested; no new migration should be needed.

Concretely:

1. New route `src/app/[locale]/(staff)/(console)/stock/page.tsx`, added to `ConsoleSidebar`.
2. Read `product_stock` and `stock_alerts()`; write through `recordStockMovement` and
   `saveProduct`, which already exist in `src/app/actions/management.ts`.
3. **One screen, two panels — not two screens.** Products and bridal accessories have the same
   UI shape (a thing, a count, a low-stock line) but different semantics: a product is *consumed*
   and an accessory is *rented and comes back*. Keeping the tables separate is correct; giving
   them two separate screens would make the sisters look in two places for "what am I short of".
   `stock_alerts()` already unions both.
4. Seed demo products in `src/lib/console/demo.ts` **in the same wave**, not later.
5. Copy under `console.stock` in all three of `messages/{fr,ar,en}.json`.

On the seeding order: the original plan put all demo data in wave 6. That was wrong — it meant
building Stock and Finances with nothing on screen to judge them by. Each wave now seeds its own
domain, so it is verifiable the day it lands.

Then wave 5 (Finances) reads the reporting functions from wave 1. Deliberately **not** a third
overview route: `/aujourdhui` answers "what is happening today", Finances answers "what did a
period earn". Extend those two; do not add a third dashboard that overlaps both.

---

## Traps that have already cost time

**A stale dev server survives across sessions.** A leftover `next start -p 3000` will serve a
deleted `.next`, every chunk 404s, nothing hydrates, and it looks exactly like a broken feature —
it once produced 47 e2e failures and a bug report about the atelier hanging, which was not a bug.
`pkill -f "next start"` **does not match these processes on Windows**. Use:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object CommandLine -like '*next*' | Stop-Process -Force
```

`playwright.config.ts` sets `reuseExistingServer: false` so the e2e suite can never inherit one.

**`npm run e2e` needs a production build first.** It runs `next start`. If you have been running
`npm run dev`, `.next` holds a dev build and Playwright fails with "Could not find a production
build". Run `npm run build` first.

**Demo mode breaks the e2e suite.** `NEXT_PUBLIC_DEMO_DATA=1` signs you in, so the ~26
`staff.spec.ts` tests asserting a signed-out redirect fail and look like a regression. Delete
`.env.local`, rebuild, then run.

**Prettier is not a dependency of this project.** Running `npx prettier --write` installs it and
reformats to *its* defaults — double quotes — against the house style, touching every line of
whatever you point it at. Formatting is ESLint's job here. If you must, pass
`--single-quote --print-width 100`.

**Do not let a dependency bump carry Next onto 16.** It is pinned to 15.x per the brief;
`create-next-app@latest` now scaffolds 16, which has breaking changes.

**A branded type that crosses to the browser must be branded with a string.** Symbol keys are
dropped crossing the Server → Client boundary. This already caused one silent bug where every
unknown price rendered blank in a Client Component.

---

## Decisions worth not re-litigating

**Why `book_appointment_as_staff` is separate from `book_appointment`.** The public one is
`security definer` because its caller is `anon`, which has no policy to run under. Reusing it for
reception would run their write with the definer's privileges and take RLS out of the path — the
boundary would still *look* correct while no longer being the boundary. The staff one is
`security invoker`, so `appointments_front_desk_write` decides, and a stylist is refused by the
same policy that governs every other write they make. There is a test for exactly that.

**Every management and reporting function is `security invoker`** for the same reason. Definer is
the exception, justified once, for an anonymous caller.

**There is no service-role key anywhere in this application**, and there must never be. It
bypasses RLS on every table. The public site reads with the anon key deliberately, so a policy
mistake surfaces instead of being masked.

**The console does not reuse the public month calendar.** That calendar sells — it shows a bride
what is open. Reception already knows the date because the client is saying it out loud, so a
typed date field is faster. The slot guarantee was never in the calendar; it is in the exclusion
constraint.

**Unknown values stay unknown.** Durations, opening hours, bridal prices, the full staff list and
testimonials are all genuinely unknown (§6) and render as `—` or "Sur devis" through
`src/lib/todo.ts`. The design file contains plausible-looking invented values for every one of
them; they are prototype filler. Filling one in with something reasonable is the single failure
mode this codebase is most carefully built to prevent.

Open business questions are tracked in `docs/OPEN_QUESTIONS.md`. Answering them is the highest
-value thing the sisters can do — real durations and opening hours would flip the booking engine
from `mode: 'request'` to `mode: 'computed'` with no code change.

---

## Still not done, beyond wave 4–6

- **No Supabase project exists.** Every migration is written and tested but has never been
  applied to a remote database. README has the provisioning steps and the first-login recipe.
- **No e2e test covers console booking.** It needs an authenticated session, and demo mode
  conflicts with the signed-out assertions. The logic has 12 database tests; the UI was verified
  by hand. Worth solving properly in wave 6.
- **Arabic and English catalogues are largely untranslated** — the design only ever translated
  ~17 strings. See `messages/TRANSLATION_STATUS.md`. New copy added since is real in all three,
  but the older bulk is not.
- **No real images.** Branded placeholders throughout, never stock photos of another salon.
