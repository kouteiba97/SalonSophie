# Handoff — resume here

Last worked: **16 August 2026**, after wave 5 and the first live database. Everything is pushed
to `main`.
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

That is genuinely all. `.env.local` is gitignored, so a fresh clone has no credentials — and the
app reads its catalogue from a committed seed when Supabase is absent, so it still shows a client
the real tariff on first run. Node 20+.

**A live Supabase project now exists** (`ns-beauty`, `eu-west-3`). To point a machine at it, put
its URL and **anon** key in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Both are in the Supabase dashboard under Settings → API. The service-role key is never needed by
this app and must never appear in a `NEXT_PUBLIC_` variable.

To look at the staff console **without** a database, use one line instead:

```
NEXT_PUBLIC_DEMO_DATA=1
```

Sign-in is bypassed and the console fills with example records. It is inert once the Supabase URL
is set — real data wins unconditionally. **Delete the file before `npm run e2e`** — see the trap
list below.

Verify the checkout is sound:

```bash
npm run typecheck && npm run lint && npm test
```

Expect **352 tests across 19 files**, green. They need no database and no network: the database
tests run the real migration files against real Postgres compiled to WASM.

---

## What state the project is in

Phases 1–6 of `BUILD_BRIEF.md` are complete. **Phase 7 is not in the brief** — it comes from a
direct instruction to turn the console into something the sisters run the whole business from:
add, update and delete anything; track products and stock; follow the money and see which of the
three businesses earns most.

Phase 7 is being built in waves. Five have landed.

| Wave | What | State |
|---|---|---|
| 1 | Inventory, expenses and reporting schema | **Done** — `20260816090000`, `20260816090100` |
| 2 | Editable tariff + opening hours (`/prestations`) | **Done** — `20260816090200` |
| 3 | Console booking — reception can finally book | **Done** — `20260816090300` |
| 4 | Stock screen — products and accessories, in and out | **Done** — no migration needed |
| 5 | Finances screen — money flow, per-line comparison | **Done** — no migration needed |
| 6 | **Test pass, translation sweep, full verification** | **Next** |

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

### What wave 4 put in the repo

**No migration.** The database layer from wave 1 was enough, as predicted.

**Screen** — `/stock`, one screen with two panels and its own front-desk gate (`stock/layout.tsx`,
the same shape as the atelier's: `products_front_desk_read` gives a stylist nothing, so saying why
beats showing them two empty panels).

**Reads** — `src/lib/console/stock.ts` (`server-only`): `product_stock` for the shelf, and
`accessories` joined against today's unreturned `accessory_loans` for the rail.

**The shortage rules are pure and tested** — `src/lib/console/shortages.ts`, with
`tests/stock.test.ts` (15 tests). They were extracted rather than left inline because one of them
encodes a §6 judgement that is easy to get quietly wrong; see the next section.

**Write** — `saveAccessoryStock` in `management.ts`. A direct table write rather than an RPC:
there is no `upsert_accessory` because the three accessories are seeded and fixed, and only their
counts were ever missing. `accessories_owner_write` is the boundary, the same way `client_notes`
and `brand_deals` are written elsewhere in the console.

**Components** — `ProductEditor`, `StockMovementForm`, `AccessoryStockForm`.

#### Two corrections to what this file used to say

**`stock_alerts()` does not union accessories.** It reads `product_stock` alone
(`20260816090100_reporting.sql`). This file previously claimed otherwise, and building on that
claim would have shipped a shortage list silently missing half its subject. The union is done in
the page instead, which is the honest place for it: an accessory shortage is not a low count, it
is *every one of them out today* — a different predicate over different tables, which does not
belong grafted onto a reorder-level query.

**Zero is not a count.** `accessories.stock_total` is 0 for every seeded row because the real
counts were never supplied, and `check_accessory_stock` skips its limit entirely on zero for that
reason. So an uncounted accessory is **never** a shortage — reading zero as an empty rail would
raise an alarm about all three on the day the salon first opens the screen, which is precisely how
a real warning gets ignored. It renders as "jamais comptés", counted separately. The same rule
applies to a product with no reorder level: "seuil non défini", never "fine".

### What wave 5 put in the repo

**No migration.** Wave 1's reporting functions were enough, as predicted.

**Screen** — `/finances`, owner-gated (`finances/layout.tsx`). Stricter than `/stock`'s front-desk
gate on purpose: reception calling a reporting function gets an empty result under RLS, so the
screen would render a row of zeros — an answer that looks like a bad month rather than a closed
door.

**The period lives in the URL** — `?period=month|last-month|year`, or `?from=&to=`. A report you
cannot send to your sister or come back to next month is not a report. The presets are links and
the custom range is a plain GET form, so both work without JavaScript.

**Reads** — `src/lib/console/finances.ts` wraps the five reporting functions. The arithmetic above
them is pure and tested: `period.ts` (month boundaries) and `money-flow.ts` (totals, ranking).

**Tests** — `tests/finances.test.ts` (23).

#### The judgements worth not re-litigating

**No margin, anywhere on the screen.** Most products have no unit cost (§6), rent may not have
been entered, and nobody is paid through this app. A profit percentage computed against partial
costs is not an estimate, it is a flattering fiction with a decimal point on it. The screen shows
a *balance of recorded movements*, says so in the copy, and lists what is missing instead.

**Every business line shows, including the ones that earned nothing.** `revenue_by_line` returns
rows only where money moved, so a quiet bridal month vanishes from the result — and "which earns
most" cannot be answered from a list missing a competitor. `revenueRanking` fills the zeros in.

**A negative balance renders as one.** Rent lands on the 1st; a short period can genuinely be
under water, and clamping it at zero would be the finances equivalent of inventing a price.

**Demo panels have to reconcile.** The first pass hand-wrote each one and the screen showed
84 320 DA earned by line above 24 680 DA of cash flow — three correct-looking panels contradicting
each other, which is worse than no demo data at all, because nobody can judge a layout while doing
arithmetic to check whether it is lying. Everything now derives from two tables at the top of the
finances block in `demo.ts`, and a test asserts the panels agree.

---

## Wave 6 — start here

The last wave: **verification, not features**.

1. **e2e for the console.** Nothing covers console booking, `/stock` or `/finances`, because all
   three need an authenticated session and demo mode breaks the signed-out assertions in
   `staff.spec.ts`. This is the gap that let the `'use server'` export bug (below) make every
   management write answer 500 while 314 tests stayed green. Solve it properly — a Playwright
   project with its own storage state, or a test-only sign-in — rather than adding more unit tests
   around it.
2. **Translation sweep.** `messages/TRANSLATION_STATUS.md` still records that the design only ever
   translated ~17 strings. Everything added in waves 2–5 is real in all three locales; the older
   bulk of `ar.json` and `en.json` is not.
3. **Full verification.** Arabic first on every screen, then English. `npm run build` before
   `npm run e2e`, and delete `.env.local` first.

Provisioning is done — the schema runs on a live project and the public site reads from it. The
one thing still blocking a full end-to-end pass is that **no staff account exists**, so nothing has
signed in yet. That is a dashboard step, not a code step; README has it.

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

**A `'use server'` file may export async functions and nothing else.** Next builds a
client-callable entry from *every* export, so one plain constant among them throws `A "use server"
file can only export async functions, found object` — **at request time, not at build time**.
`management.ts` exported an unused `managementIdleState` object, and every write on that file
answered 500: the tariff, the opening hours, products, stock, spending. It typechecks, it lints,
it builds, and it looks like a broken screen rather than a broken export. Fixed in wave 4; if you
add a shared constant beside an action, put it in `src/lib/` instead.

**Distinguish "no database" from "not permitted".** `requireOwner()` returned a bare null for
both, so an owner in demo mode was told "only Nour and Sophie can change this" — sending them
after a permissions problem they did not have. It now returns which one failed. Any new guard
should do the same; the rule is that an error says what to do next, and those two say opposite
things.

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

- **The database is provisioned, but nobody can sign in yet.** All 20 migrations are applied to a
  live project in `eu-west-3`, and the public site reads its catalogue from it. What is missing is
  the **first staff account**: it must be created by hand in the Supabase dashboard and then given
  a row in `public.users`, because there is deliberately no sign-up screen — the console holds
  every client's phone number. README has the recipe. Until it exists, sign-in and cookie refresh
  remain the one part of the stack never exercised against the real thing.
- **No e2e test covers console booking, or the stock screen.** Both need an authenticated session,
  and demo mode conflicts with the signed-out assertions. Their logic has database and unit tests;
  the UI was verified by hand. Worth solving properly in wave 6 — and note what it would have
  caught: the `'use server'` export bug above made every management write answer 500 while every
  test stayed green, because nothing exercised a form submission end to end.
- **Arabic and English catalogues are largely untranslated** — the design only ever translated
  ~17 strings. See `messages/TRANSLATION_STATUS.md`. New copy added since is real in all three,
  but the older bulk is not.
- **No real images.** Branded placeholders throughout, never stock photos of another salon.
