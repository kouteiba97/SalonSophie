# The Sisters N&S

Production web platform for **The Sisters N&S** — a salon, bridal-rental atelier and creator
brand sharing one address and one phone at UV5, Nouvelle Ville (next to Cirta School),
Constantine, Algeria. Run by two sisters, Nour and Sophie.

Two surfaces: a **public site** (clients browse gowns and services, see prices, book) and a
**staff console** (reception books, everyone sees the day, Sophie manages gowns and brand deals).

The primary client is a woman arriving from an Instagram reel, on a mid-range Android phone, on
Algerian 4G. Every decision is measured against that.

> **Picking the work back up on another machine? Read [docs/HANDOFF.md](docs/HANDOFF.md) first.**
> It says where the last session stopped, what the next task is, and which traps have already
> cost a day. This file explains how the repository works; that one explains where it is.

---

## Getting started on a new machine

```bash
git clone https://github.com/kouteiba97/SalonSophie.git
cd SalonSophie
npm install
cp .env.example .env.local     # optional — see below
npm run dev
```

Open http://localhost:3000 — it redirects to `/fr`. Also check `/ar`, which is the one that
catches layout mistakes.

**It runs with no configuration at all.** With no `.env.local`, the catalogue is served from the
committed seed — the same tariff the database migration seeds — so a fresh clone shows real
prices, not an empty page. Fill in `.env.local` only once a Supabase project exists.

### Requirements

- Node 20+ (developed on 24)
- No Docker needed. The database tests run Postgres in-process via PGlite.

### Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm start            # serve the build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest — unit + real-Postgres schema tests
npm run e2e          # playwright (runs `next build` output; run `npm run build` first)
```

`npx playwright install chromium` once, before the first `npm run e2e`.

---

## Where things are

```
BUILD_BRIEF.md                    the authoritative spec — read this first
CLAUDE.md                         stack, conventions, non-negotiables, design tokens
docs/OPEN_QUESTIONS.md            business rules still unanswered — READ BEFORE BUILDING
Sisters NS Beauty - Standalone.html   the approved visual design (a self-extracting bundle)

src/app/[locale]/(site)/          the public site: home, services, robes, + detail pages
src/app/[locale]/(staff)/         login, and (console)/ — today, atelier, clients, prestations, stock
src/components/sections/          the ten page sections, in the design's DOM order
src/components/booking/           the five-step booking flow (reducer + steps)
src/components/staff/             console components — day-line, KPIs, gowns, reservations
src/data/                         catalogue repository, real §6 tariff, business constants
src/lib/availability/             the availability engine (pure) + its database repository
src/lib/atelier/                  date ranges and utilisation (pure) + its database repository
src/lib/console/                  day-line, KPIs, deals (pure) + inbox/clients/deal repositories
src/lib/auth.ts                   who is signed in, and what role they hold
src/lib/notifications/            WhatsApp port, Cloud adapter, manual fallback
src/lib/todo.ts                   every value nobody has told us yet
messages/                         fr / ar / en catalogues + TRANSLATION_STATUS.md
supabase/migrations/              15 migrations — schema, RLS, seed, booking, atelier, inbox
tests/                            unit tests + tests/db (real Postgres via PGlite)
e2e/                              Playwright: booking, gowns, sections, tokens, staff boundary
```

---

## Current state

| Phase | Status |
|---|---|
| 1 — Public site, routing, i18n, booking UI | **Done** |
| 2 — Supabase schema, auth, RLS, seed | **Done, not yet applied to any database** |
| 3 — Availability engine, server-side booking, notifications | **Done** |
| 4 — Bridal atelier (staff) | **Done, unverifiable against a live database** |
| 5 — Staff console | **Done** |
| 6 — CRM, inbox, brand deals | **Done** |
| 7 — Management console (not in the brief) | **In progress — 3 of 6 waves** |

All six brief phases are built. Verified at the last commit: lint clean, typecheck clean,
**314 unit tests**, **50 Playwright tests**, production build green.

Phase 7 does not come from `BUILD_BRIEF.md`. It comes from a direct instruction to make the
console the place the sisters run the whole business from — create, update and delete anything;
track the products they use and their stock; follow the money and see which of the three
businesses earns most. Its wave plan and next task live in [docs/HANDOFF.md](docs/HANDOFF.md).

### What Phase 7 has shipped so far

**Inventory and money, in the database first.** `products`, `suppliers`, `stock_movements`,
`expenses`, and reporting functions that answer the actual question asked — `revenue_by_line`
compares salon, bridal and brand across the three different ways each of them earns. Stock is
**derived from signed movements**, never a stored counter, and a check constraint ties the sign
to the reason so a delivery cannot decrease stock.

**The tariff became editable.** `/prestations` was a read-only price list; prices, categories and
opening hours are now editable from the console, owner-only. Hours reaching `business_hours` is
what will eventually flip the booking engine from `mode: 'request'` to real computed slots.

**Reception can book.** `/aujourdhui` has a four-step new-appointment modal — business line,
service, expert, then slot and client, with a debounced client search so booking a regular does
not mint a second record for her. It goes through `book_appointment_as_staff`, which is
`security invoker` precisely so RLS stays the boundary; a stylist is refused by the same policy
that governs every other write they make.

**The shelf has a screen.** `/stock` puts products and bridal accessories side by side — separate
tables, because a product is consumed and an accessory is rented and comes back, but one screen,
because "what am I short of" is one question and answering it in two places is how a salon runs
out of something it owns. Reception records what was used or delivered; only an owner adds a
product or sets what it costs. A delivery with a cost writes the matching expense in the same
transaction, so restocking cannot appear in the stock history without appearing in the money
going out.

Two things there stay deliberately unknown. A product with no reorder level reads "seuil non
défini", not "stock is fine" — a defaulted zero would silently claim every product in the salon
was fine. An accessory with `stock_total = 0` reads "jamais comptés", not "none": zero is the
seeded default and means nobody has counted them, which is also why `check_accessory_stock` skips
its limit there rather than blocking every loan the salon actually makes.

### What Phase 4 shipped

A staff surface at `/[locale]/atelier`, behind a Supabase password login at `/[locale]/connexion`.
Signed out, every atelier URL redirects; a stylist who reaches one is told plainly that the
atelier is not theirs rather than shown an empty console.

It is the **bridal atelier only** — gowns, their four states, reservations and their four states,
accessories, deposits and utilisation per gown. The day-line view, clients and brand deals are
Phase 5 and 6.

Reception can read the atelier and cannot write to it. That is not a UI decision: it is
`gown_reservations_owner_write` in the RLS migration, and `reserve_gown` is deliberately **not**
`security definer` so the policy is what actually refuses the write. A definer function would
have handed reception the owner's permissions and left the policies in place looking correct.

**The whole surface is untested against a live Supabase project, because none exists.** The
database logic is proven — 29 tests run the real migrations against real Postgres via PGlite,
including the double-booking constraint and each RLS boundary — but sign-in, cookie refresh and
PostgREST's own error shapes have never run against the real thing. Expect to fix something on
the day the project is provisioned.

### What Phase 5 shipped

The console proper: a sidebar over **Today**, the atelier, **Clients** and **Services & prices**.
A stylist belongs here too — §7 gives them their own day and their own clients, and
`appointments_read` already limits them to exactly that, so the console gate only requires a
session. The atelier keeps its own front-desk check.

**Today** is §13's day-line: three lanes on one timeline, click a block for detail and a WhatsApp
button. Two things about it are worth knowing before reading the code, because both look like
omissions and are neither:

- **The axis is not 09:00–19:00.** Those hours were invented by the design, and §6 lists opening
  hours as unknown. The scale comes from `business_hours` when that table is filled in, and
  otherwise from the appointments actually in the book — a claim about what is in the diary, not
  about when the salon is open. With neither, the page says there is nothing to draw rather than
  rendering an empty grid that reads as a closed day.
- **Requests are not blocks.** Durations are unknown, so most bookings are requests that hold no
  slot. Drawing them on the grid would give them a width nobody supplied. They sit under the
  lane, at the time the client asked for.

Phase 5 also fixed a Phase 3 gap: `book_appointment` looked a service up and never stored it, so
`appointment_services` was empty and an appointment recorded who and when but not *what*. The
day-line needs "client and service" on every block, and reception needed it more.

### What Phase 6 shipped

**Clients** gained a detail page: appointment history across all three lines, gown reservations,
and free-text notes attributed to whoever wrote them — the colour formulas and allergies that
currently live in somebody's memory.

**Messages** is the unified inbox. One list across WhatsApp, Instagram, the phone and the door,
unanswered first. A conversation's `is_answered` is derived by a database trigger from its latest
message rather than set by callers, so the alert on the day-line cannot drift out of step with
the thread — and a reply logged late does not mark a conversation answered when a newer question
arrived after it.

The inbox **records what was said; it does not send it.** There is no Meta integration (§10), so
the WhatsApp button is what delivers the message and the log keeps the thread accurate
afterwards. A console showing a reply the client never received would be the communications
equivalent of inventing a price, so the UI says which is which instead of hiding it behind a
"Send" button that only writes to a table.

**Collaborations** is §13's four-column kanban, owner-only — the line non-negotiable #5 names
outright. Cards move with buttons rather than drag-and-drop, which keeps the board usable by
keyboard and on the phone Sophie actually carries.

Phase 6 also fixed a Phase 1 bug: `TodoValue` was branded with a `Symbol`, which does not survive
the Server → Client boundary. Every unknown price handed to a Client Component arrived
unbranded, so `isTodo` returned false and the booking modal rendered gowns with a **blank** price
while the card behind it said "Sur devis". The brand is now a string, and a test asserts the
round-trip.

### The database is written but not provisioned

No Supabase project exists yet. The migrations are complete and tested — against real Postgres,
not a mock — but have never been applied to a remote database. To provision:

1. Create a Supabase project.
2. Apply `supabase/migrations/*.sql` in filename order (Supabase CLI, or paste into the SQL
   editor in order).
3. Put the project URL and **anon** key in `.env.local`.
4. Regenerate types:
   `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts`
   then restore the `Database` generic in `src/lib/supabase/server.ts` and delete the `callRpc`
   cast helper. See the note in that file.

The service-role key is never needed by this app and must never appear in a `NEXT_PUBLIC_`
variable.

### Creating the first staff login

There is no sign-up screen, deliberately: the console holds every client's phone number, and a
surface that lets anyone register is a surface that hands out access to it. Accounts are made by
hand, twice — once in Supabase Auth, once in `public.users` to say what the account may do.

1. Create the user in the Supabase dashboard (Authentication → Users → Add user).
2. Give them a role, using the id from step 1:

```sql
insert into public.users (id, tenant_id, role_key, full_name, email)
values ('<auth-user-id>', '<tenant-id>', 'owner', 'Sophie', 'sophie@example.com');
```

3. If they are a bookable person as well as a console user, link the two:
   `update public.staff set user_id = '<auth-user-id>' where slug = 'sophie';`

An auth account with no `public.users` row gets no console at all rather than a default one —
so step 2 is not optional, and forgetting it fails closed.

---

## Resolved: "the atelier hangs on its loading skeleton"

**There was no bug.** The cause was a stale `next start` process, and it is worth reading before
you debug anything that looks like a hydration failure, because the symptoms are convincing.

A leftover server keeps serving its own build after `.next` has been deleted and rebuilt. The
HTML it returns references chunk hashes that no longer exist on disk, so every client chunk 404s,
nothing hydrates, and every Suspense boundary sits on its fallback forever. What you see is a
page stuck on its loading skeleton with the real content parked in a `hidden` element and **no
errors in the console** — exactly what a broken boundary would look like.

`/atelier` was the only screen with a `loading.tsx`, which is why it looked atelier-specific.
Against a correctly-served build it reveals in about 1.3 seconds, and `e2e/atelier.spec.ts`
now asserts that, including that nothing is left parked in a hidden placeholder.

Two changes make the trap loud instead of silent:

- `playwright.config.ts` sets `reuseExistingServer: false`, so the suite never tests a build it
  did not serve. An occupied port is now an immediate error.
- On Windows, **`pkill -f "next start"` does not match these processes.** Use:

  ```bash
  powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*next*' } | Stop-Process -Force"
  ```

If a page ever looks unhydrated again, check first that a referenced chunk actually resolves:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3100$(curl -s http://127.0.0.1:3100/fr | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1)"
```

A 404 there means a stale server, not a React problem.

## Seeing the console without a database

`NEXT_PUBLIC_DEMO_DATA=1` fills the console with example clients, appointments, messages and
collaborations so it can be looked at. It signs you in as an owner, because there is nothing to
protect: the flag has **no effect** once `NEXT_PUBLIC_SUPABASE_URL` is set, so demo data and real
data can never coexist. Every screen carries a banner saying the data is fictional, and the
public site never shows any of it.

This is §14's "seed realistically — an empty app cannot be evaluated", not a hole in §6. The
records are invented; no business fact is. An appointment whose tariff entry is a range still has
no settled price, and a pitched deal still has no agreed fee.

**Turn it off before running `npm run e2e`.** `e2e/staff.spec.ts` asserts that the console
redirects to sign-in when signed out; demo mode signs you in, so those ~26 tests fail and look
like a regression. Remove `.env.local`, rebuild, then run. The three `atelier.spec.ts` tests are
the mirror image — they skip without demo mode, because there is no console to assert on.

## Before you write code

Read **[docs/HANDOFF.md](docs/HANDOFF.md)** for where the work stopped, and
**`docs/OPEN_QUESTIONS.md`** for what is still unanswered.

Several of those questions are business rules that are genuinely unknown — opening hours, service
durations, bridal prices, deposit and cancellation policy — and the codebase is built to render
them as `—` or "Sur devis" rather than guess. Filling one in with a plausible value is the one
failure mode this project is most careful about: a missing price is recoverable, a wrong one
shown to a client is not.

**Formatting is ESLint's job — Prettier is not a dependency here.** `npx prettier --write` will
install it, reformat to its own defaults (double quotes) against the house style, and touch every
line of whatever you point it at.

`CLAUDE.md` has the ten non-negotiables. The two that shape the most code:

1. **A gown cannot be double-booked**, enforced by a Postgres exclusion constraint rather than
   application code. A double-booking is discovered on the wedding day and cannot be fixed.
2. **Nothing is invented** — no price, duration, staff member, opening hour or testimonial.
