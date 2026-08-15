# N&S Beauty Platform

Production web platform for **The Sisters N&S** — a salon, bridal-rental atelier, and creator
brand sharing one address and one phone at UV5, Nouvelle Ville (next to Cirta School),
Constantine, Algeria. Run by two sisters, Nour and Sophie.

Two surfaces: a **public site** (clients browse gowns and services, see prices, book) and a
**staff console** (reception books, everyone sees the day, Sophie manages gowns and brand deals).

Authoritative spec: [BUILD_BRIEF.md](BUILD_BRIEF.md). Visual source of truth:
`Sisters NS Beauty - Standalone.html` (see [Design file](#design-file)).

Primary client: a woman arriving from an Instagram reel, on a mid-range Android phone, on
Algerian 4G. Every decision is measured against that.

---

## Stack

```
Next.js 15 (App Router) · TypeScript (strict) · Tailwind 4 · shadcn/ui
Supabase — Postgres, Auth, Storage, Realtime, RLS
next-intl (fr default, ar, en) · Zod · React Hook Form · TanStack Query
Vitest + Testing Library · Playwright
Deploy: Vercel + Supabase
```

**Not in this project:** React Three Fiber, WebGL, Stripe, Google Fonts network requests.

Next is pinned to **15.x** per the brief. `create-next-app@latest` now installs 16.x, which has
breaking changes — do not let a routine dependency bump carry the project onto 16 without a
decision.

Tailwind 4 is CSS-first: the theme lives in `@theme` inside `src/app/globals.css`, not in a
`tailwind.config.ts`.

### Commands

```
npm run dev         npm run build        npm start
npm run lint        npm run typecheck
npm test            npm run e2e
```

---

## Non-negotiables

These are not preferences. A change that breaks one of these is wrong even if it looks right.

1. **Gown double-booking impossible at the database level** — a Postgres `exclude using gist`
   constraint, not application code. A double-booking is discovered on the wedding day and
   cannot be fixed.
2. **No invented prices, durations, or staff.** Use `TODO_*` constants (see [Unknown data](#unknown-data--todo_-constants))
   and emit a build-time warning. A missing price is recoverable; a wrong one shown to a client is not.
3. **Arabic RTL correct on every screen, tested before English.** If it only looks right in
   English, it isn't done.
4. **LCP < 2.5s on simulated 4G, CLS < 0.1.** No WebGL. No parallax on touch devices.
5. **RLS on every table** — reception can't see brand deals; stylists can't see other stylists' clients.
6. **Zod validation at every boundary.** The server re-validates every booking.
7. **No secrets in client bundles.**
8. **Keyboard navigable**, including the before/after slider and the calendar. Visible focus. WCAG AA.
9. **`audit_log` on every mutation** to appointments, reservations, payments.
10. **Visual output identical to the design.** Upgrade the engineering, never the aesthetics.

---

## Design tokens

Defined as CSS custom properties in `globals.css` and exposed through the Tailwind theme.
**No raw hex in components — ever.** If a colour is missing, add a token.

```css
--rose-deep:#8B6F7D;    --rose-mid:#A8899A;      --rose-dark:#7C6070;
--rose-soft:#C9A9A6;    --blush:#E8D5D0;         --blush-2:#EBD8CF;
--blush-3:#E2D0CB;      --tint:#F3EAE7;          --champagne:#D4B896;
--champagne-lt:#F0DCB8; --cream:#F7F3F0;         --cream-warm:#FBF8F7;
--charcoal:#2E2A28;     --ink-2:#5C534E;         --taupe:#A08D82;
--taupe-2:#7A6E68;      --line:#E7DEDA;          --muted:#C7BAB3;
--muted-2:#DAD1CB;      --white:#FFFFFF;
```

### Typography

Self-hosted via `next/font/local`. The woff2 subsets were extracted from the design bundle —
there are no Google Fonts network requests.

| Face | Role | Weights | Line-height |
|---|---|---|---|
| Cormorant Garamond | display headings | 300 / 400 | — |
| Parisienne | script accent | 400 | — |
| Jost | body | 300 | 1.65 |
| Noto Kufi Arabic | Arabic | 300 / 400 | 1.95 |

**Parisienne is used on exactly one emphasised word per headline. Never more.**

### Animation

Six keyframes, ported verbatim from the design. Do not retime them.

- `nsWord` — headline words blur in: `opacity 0→1, blur(12px)→0, translateY(14px)→0`
- `nsReveal` — section reveal: `opacity 0→1, translateY(24px)→0`
- `nsFloat` — gold particles rising 260px, fading at 18%
- `nsFlicker` — neon sign flicker on load
- `nsSway` — pendant lights rotate ±1.1deg, infinite
- `nsKen` — Ken Burns, `scale(1.02)→(1.08)`

**Hero parallax** — damped CSS only, no 3D:

- `mousemove` normalised to −1..1
- Damped lerp at **0.045** per frame, one `requestAnimationFrame` loop
- Applied as `translate3d(-cx*16px, -cy*11px, 0) scale(1.05)`
- Gated on `matchMedia('(pointer:fine)')` **and** no `prefers-reduced-motion`
- Ken Burns drift is the touch / reduced-motion fallback
- Remove listeners and `cancelAnimationFrame` on unmount; pause via IntersectionObserver
  when the hero scrolls out of view

**Global:** `scroll-behavior:smooth` · `::selection{background:#E8D5D0}` · 6px rose scrollbars ·
`prefers-reduced-motion` block collapsing all animation to `.01ms`.

Section reveals are driven by IntersectionObserver with `once: true` — never on a bare timer.

### Sections and anchors

`#top` (hero) · `#services` · `#mariee` (bridal) · `#tarifs` (full price list) ·
`#soeurs` (the sisters) · `#contact`

The design also contains four **unanchored** sections that are part of the approved visual and
must be ported: bridal packages, transformations (before/after slider), testimonials, and the
Instagram grid.

---

## Internationalisation

Three locales: **`fr` (default) · `ar` · `en`**. Arabic is a first-class mode, not a translation layer.

- Locale is a **URL segment** (`/[locale]/...`), never client-side state. All three must be indexable.
- `dir` and `lang` go on `<html>`, never on a nested div.
- **Logical properties only** — `ms-`/`me-`, `ps-`/`pe-`, `start`/`end`.
  Never `ml-`/`mr-`/`left`/`right`. This is the single most common way RTL breaks.
- Dates via `toLocaleDateString` with `ar-DZ` / `fr-FR` / `en-GB`.
- Every user-facing string lives in a message catalogue. No inline copy in components.
- `hreflang` alternates and per-locale metadata on every page.

**Test order: Arabic first, then English.** French will look fine by construction.

> The design file only ever translated ~17 strings into Arabic (nav, hero, two CTAs, four trust
> badges). Everything else in `messages/ar.json` and `messages/en.json` is awaiting real
> translation — see `messages/TRANSLATION_STATUS.md`.

---

## Money, dates, formatting

- **Money is integers in centimes.** Never floats. Never a `number` that means "dinars".
- Services with a range carry `price_min` / `price_max` and render `14 000 – 35 000 DA`.
- Format with `Intl.NumberFormat('fr-DZ')` → `16 000 DA`.
- **Timestamps stored UTC, displayed `Africa/Algiers`.** Algeria is UTC+1 with no DST, which
  makes it easy to get away with a bug that surfaces only in a customer's timezone. Store UTC anyway.
- Phone validation: Algerian mobile `0[5-7]\d{8}`.

### Contact

The business has **one** phone line: `0553366712` → international `+213553366712`
(`https://wa.me/213553366712`).

> The design file hardcodes `+213 661 23 45 67` as a placeholder. It is not a real number.
> Never ship it.

---

## Unknown data — `TODO_*` constants

These values are **not known** and must not be invented. They live behind `src/lib/todo.ts`,
render as `—` or `Sur devis`, and log a build-time warning:

- Service **durations**
- Bridal **rental prices**
- Bridal **package prices**
- **Opening hours**
- Full **staff list** (only **Nour** and **Sophie** are confirmed)
- Client **testimonials** (the three in the design are unverified and unattributable)

**The design file contains plausible-looking invented values for every one of these.** They are
prototype filler, not business data. Porting them verbatim would violate non-negotiable #2.
Port the layout; replace the values. See [Design file](#design-file).

Known-good data, safe to seed: the §6 published tariff, the eight category names, the three gown
names with their size ranges and tiers, and the accessory list (barnous, diadème, veil).

---

## Database

Migrations are the source of truth and live in `supabase/migrations/`, applied in filename
order. There is **no Supabase project provisioned yet** — the migrations are written and tested
but have not been applied to a remote database.

```
20260815120000_extensions.sql         btree_gist
20260815120100_core.sql               tenants, locations, business_hours, users, staff, schedules
20260815120200_catalogue.sql          categories, services, variants
20260815120300_clients_appointments.sql
20260815120400_bridal.sql             gowns, reservations (the exclusion constraint), money
20260815120500_comms_content.sql      inbox, content, brand deals, reviews
20260815120600_audit.sql              audit_log + triggers
20260815120700_rls.sql                helper functions + policies for every table
20260815120800_seed_catalogue.sql     the real §6 tariff, three gowns, accessories
20260815120900_grants.sql             anon/authenticated grants
20260815121000_booking_rpc.sql        book_appointment, busy_spans
20260815121100_availability_rpc.sql   shift windows, time-off spans
20260815121200_bridal_atelier.sql     reserve_gown, status transitions, utilisation
20260815121300_booking_records_service.sql  book_appointment also writes appointment_services
```

**Money is `bigint` centimes.** The `services` table carries a `price_kind` enum plus
`price_min`/`price_max`, with a check constraint per kind — a `range` without an upper bound or
a `free` service with a price is rejected by the database, not by a component.

**`business_hours` ships empty on purpose.** Hours are unknown (§6); an empty table says "we
don't know yet" where a seeded guess would say something false to a client planning her week.

### Testing the schema

`tests/db/` runs the **real migration files against real Postgres**, in-process, via PGlite
(Postgres compiled to WASM, with the `btree_gist` contrib module). No Docker, so it runs in CI.
The only stub is Supabase's `auth` schema, which the platform provides at runtime.

This is how non-negotiable #1 is proven rather than asserted: overlapping, contained and
identical date ranges are all rejected with `23P01`, while adjacent ranges, a different gown and
cancelled reservations are allowed. RLS is exercised by `SET ROLE authenticated` with a JWT
claim — superusers bypass RLS, so a test that skipped the role switch would prove nothing.

### Reading the catalogue

`src/data/catalogue.ts` is the only way the app reads services, gowns and accessories. It reads
from Postgres when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, and
falls back to the committed seed otherwise — the same tariff, so a build, a preview deploy, a
fresh checkout, or an unreachable database all still show a client what a brushing costs.

Reads use the **anon key**, deliberately: the public site should see exactly what an anonymous
visitor is allowed to see, so a policy mistake surfaces instead of being masked by a privileged
key. The service-role key must never enter this path.

---

## Booking

**The availability engine is a pure function** — `src/lib/availability/engine.ts`. No clock, no
database, no globals: inputs in, slots out. That is what makes the awkward cases testable (a
stylist on leave for half a day, a service that will not fit before closing, a split shift over
lunch). `repository.ts` feeds it from the database; the engine never touches the network.

**It degrades honestly.** Opening hours and durations are unknown (§6), so the engine returns
`mode: 'request'` rather than inventing either — the client proposes a time and the salon
confirms on WhatsApp. When real hours and durations exist the same engine returns
`mode: 'computed'` with real slots, and nothing else changes.

**A request is not a booking.** `appointments.period` is nullable, with `requested_start` set
instead, and exactly one of the two must be present. A NULL never conflicts in an exclusion
constraint, so requests hold no slot and cannot block a real booking. Telling a client
"c'est réservé" for a request would be the booking-flow equivalent of inventing a price.

**The transaction lives in Postgres.** `public.book_appointment(...)` is a narrow `security
definer` function callable by `anon`. The alternative — a service-role key in the Next server —
is a key that bypasses RLS on every table held by a process that also renders HTML. The function
re-validates everything, and `23P01` becomes a clean `booking_slot_taken`.

**Availability reads never expose people.** `busy_spans`, `staff_shift_windows` and
`staff_time_off_spans` return slugs and times only. No client, no name, no reason.

**Rate limited by IP and phone** (`src/lib/rate-limit.ts`). The in-memory store is honest for one
instance and wrong across several — each region keeps its own counter, so the effective limit
multiplies. Swap the store, not the call sites.

**Notifications go through a port** (`src/lib/notifications/`). With no Meta credentials the
manual adapter runs and reports `delivered: false` — it does not pretend. A failed notification
never fails a booking: the appointment is already committed, and a client who is in the book but
missed a message is recoverable; the reverse is not.

---

## The staff console

Two surfaces share one document shell, split by route group under `src/app/[locale]/`:
`(site)` carries the public chrome — header, footer, sticky CTA, WhatsApp bubble, booking modal —
and `(staff)` carries none of it. Route groups do not appear in the URL, so the public paths are
unchanged.

`/[locale]/connexion` signs in. Everything else lives under a nested `(console)` group —
`/aujourdhui` (the day-line), `/atelier`, `/clients`, `/prestations`. All of it is
`force-dynamic` on the `(staff)` layout, and that is **load-bearing**: with no Supabase
credentials present, as during a build, the session lookup short-circuits without reading a
cookie, the pages look perfectly static, and Next will happily prerender the signed-out redirect
into the deployment.

**The console gate requires a session, not a role.** A stylist belongs here: §7 gives them their
own day and their own clients, and `appointments_read` already limits them to exactly that. Only
the atelier adds a front-desk check, because `gown_reservations_read` excludes stylists outright.

**The day-line's axis is derived, never assumed.** The design hardcoded 09:00–19:00; §6 lists
opening hours as unknown. It comes from `business_hours`, falling back to the day's own
appointments — which claims only "these hours have something in them" — and failing both, the
page says there is nothing to draw. Requests are drawn under the lane rather than on it: they
hold no slot, and a block would give them a duration nobody supplied.

**Authorisation is RLS, not the console.** The layout's role check produces a better message; it
is not the boundary. Atelier writes go through Postgres functions that are deliberately **not**
`security definer` — unlike `book_appointment`, whose caller is `anon` and has no policy to run
under. A definer function here would hand reception the owner's permissions and leave the
policies in place looking correct.

The console reads through a **cookie-bound** client (`src/lib/supabase/session.ts`), distinct
from the session-less anon client the public site uses. Both use the anon key. There is no
service-role key anywhere in this application.

## Conventions

**Structure.** Every service and every gown gets its own route — `/[locale]/services/[slug]`
and `/[locale]/robes/[slug]`. A bride must be able to send her mother a link to one gown.
Anchors alone are not enough.

**State.** Locale is a URL segment. Category filter and search are URL query params, so results
are shareable and the back button works. The booking flow has its own reducer. Form fields are
React Hook Form + Zod. There is no mega-state object.

**Components.** One concern each. No component holds a whole page. Server Components by default;
`'use client'` only where interaction genuinely requires it.

**Accessibility is part of "done", not a follow-up pass.** Real `<button>` elements with
`aria-pressed` / `aria-selected`. Modals use the shadcn Dialog primitive (focus trap, Escape,
`aria-modal`, scroll lock, focus restore — all of it, free). Step changes announce via
`aria-live="polite"`. Disabled dates carry `aria-disabled` and a text reason ("Fermé", "Complet"),
never colour and strikethrough alone. Skip link and landmarks on every page.

**Every list has four states**: loading, empty, error, and populated. Written in the brand's
voice — an empty result invites an action, an error says what to do next.

**Images.** `next/image` with explicit dimensions everywhere. Hero is `priority` with a blur
placeholder; everything else lazy. Branded placeholders until real assets arrive —
**never stock photos of another salon.**

**Tests.** Write them for the rules that hurt when broken: gown overlap, appointment conflicts,
RLS boundaries. Playwright end-to-end for two flows — booking a salon appointment, reserving a gown.

**Commits.** Small, one concern each, conventional messages.

**Seed realistically.** An empty app cannot be evaluated.

**Ask before assuming.** If a business rule is unclear — deposit amounts, cancellation windows,
how far ahead a gown can be held — stop and ask rather than inventing policy. Inventing policy
is the same failure mode as inventing a price.

---

## Design file

`Sisters NS Beauty - Standalone.html` is the approved visual design and the visual source of
truth. It targets an internal template runtime that does not exist in our stack — **port it,
don't reuse it.**

It is a self-extracting bundle. To read it:

- Real source is gzipped base64 inside `<script type="__bundler/manifest">`
- Page markup is JSON-encoded inside `<script type="__bundler/template">`
- Component logic is the `<script type="text/x-dc" data-dc-script>` block — a class
  `Component extends DCLogic`
- The manifest also holds the four **woff2 font subsets**, already extracted to `src/fonts/`

| Design construct | Port to |
|---|---|
| `<x-dc>` template + `DCLogic` class | React function components + hooks |
| `<sc-if value="{{ isFr }}">` | next-intl locale routing |
| `style-hover="..."` attribute | Tailwind `hover:` variants |
| Inline `style` on every element | Tailwind + CSS custom properties |
| `<image-slot id="...">` | `next/image` from Supabase Storage |
| `this.state` mega-object | Decomposed state |
| `this.hash()` fake availability | Real Supabase queries |

**Match the visual output exactly** — same layout, same colours, same animation timings, same
DOM order. Upgrade the engineering underneath, never the aesthetics.

### The design file is a visual prototype, not a data source

Its numbers are filler. Specifically, **do not port**: the `SERVICES` array (prices and
durations conflict with the real published tariff), the `EXPERTS` array (invents two staff
members who are not confirmed to exist), gown rental and package prices, the opening hours in
the contact section, the placeholder phone number, or the named client testimonials.

Its **layout, tokens, keyframes, DOM order, and copy structure** are authoritative.

### Known defects in the design — fix while porting, do not reproduce

- Availability is faked with a string hash (`hash()`, `slotsOf()`, `hash(iso)%11===0`) — deleted.
  Real availability derives from `staff_schedules`, existing `appointments`, `staff_time_off`,
  and the service's real duration.
- Friday-closed is hardcoded as `d.getDay()===5` — move to a `business_hours` table with per-day
  open/close plus exception dates.
- No booking horizon — add minimum lead time and maximum advance window as config.
- No server-side conflict check — optimistic UI is fine, but the server re-validates on submit
  inside a transaction. Two clients must never take one slot.
- Bridal items are mixed into the service list — a gown in the booking flow creates a **fitting
  appointment**, not a rental. Rentals are date ranges: separate flow, separate table.
- Search has no debounce — debounce 250ms.
- The before/after slider is pointer-only — add keyboard (arrows ±2%, Home/End), `role="slider"`,
  `aria-valuenow`, visible focus ring.
- No form validation, no metadata, no error boundary, no 404, no sticky mobile CTA.

---

## Build order

An approval gate sits between every phase. **Do not start the next phase until confirmed.**

| Phase | Deliverable |
|---|---|
| 1 | Public site ported with all upgrades. Real routing, real i18n, booking UI complete, data seeded statically. **This is what gets shown to the client — it must be flawless.** |
| 2 | Supabase schema, auth, RLS. Seed the catalogue and gowns. Wire services and tariff to the database. |
| 3 | Real booking: availability engine, server-side conflict prevention, confirmations, WhatsApp reminders. |
| 4 | Bridal atelier (staff): gown reservations with the exclusion constraint, four states, accessories, fittings, contracts, utilisation per gown. |
| 5 | Staff console — day-line view, KPIs, bridal atelier, clients, brand deals. |
| 6 | Client CRM, unified inbox, brand-deal pipeline. |

After each phase: run the build and tests, then summarise what shipped and what you would flag.

---

## Integrations

- **WhatsApp Business Cloud API** — reminders at booking, 24h, and 2h. The real communication
  channel in Algeria.
- **Instagram Graph API** — DMs, comments, post metrics.
- **Payments** — deposit + cash-on-arrival first. CIB / Edahabia (SATIM) later.

Meta API approval may take weeks. **The entire core — bookings, gowns, clients — must work with
zero social integration.** Build these behind an adapter interface with a manual fallback so
nothing blocks on Meta approval.
