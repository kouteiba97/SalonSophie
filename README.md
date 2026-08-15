# The Sisters N&S

Production web platform for **The Sisters N&S** — a salon, bridal-rental atelier and creator
brand sharing one address and one phone at UV5, Nouvelle Ville (next to Cirta School),
Constantine, Algeria. Run by two sisters, Nour and Sophie.

Two surfaces: a **public site** (clients browse gowns and services, see prices, book) and a
**staff console** (reception books, everyone sees the day, Sophie manages gowns and brand deals).

The primary client is a woman arriving from an Instagram reel, on a mid-range Android phone, on
Algerian 4G. Every decision is measured against that.

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
src/app/[locale]/(staff)/         the console: login, bridal atelier
src/components/sections/          the ten page sections, in the design's DOM order
src/components/booking/           the five-step booking flow (reducer + steps)
src/components/staff/             console components — gown states, reservations, forms
src/data/                         catalogue repository, real §6 tariff, business constants
src/lib/availability/             the availability engine (pure) + its database repository
src/lib/atelier/                  date ranges and utilisation (pure) + its database repository
src/lib/auth.ts                   who is signed in, and what role they hold
src/lib/notifications/            WhatsApp port, Cloud adapter, manual fallback
src/lib/todo.ts                   every value nobody has told us yet
messages/                         fr / ar / en catalogues + TRANSLATION_STATUS.md
supabase/migrations/              13 migrations — schema, RLS, seed, booking + atelier functions
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
| 5 — Staff console | Not started |
| 6 — CRM, inbox, brand deals | Not started |

Verified at the last commit: lint clean, typecheck clean, **193 unit tests**, **36 Playwright
tests**, production build green.

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

## Before you write code

Read **`docs/OPEN_QUESTIONS.md`**. Several business rules are genuinely unknown — opening hours,
service durations, bridal prices, deposit and cancellation policy — and the codebase is built to
render them as `—` or "Sur devis" rather than guess. Filling one in with a plausible value is the
one failure mode this project is most careful about: a missing price is recoverable, a wrong one
shown to a client is not.

`CLAUDE.md` has the ten non-negotiables. The two that shape the most code:

1. **A gown cannot be double-booked**, enforced by a Postgres exclusion constraint rather than
   application code. A double-booking is discovered on the wedding day and cannot be fixed.
2. **Nothing is invented** — no price, duration, staff member, opening hour or testimonial.
