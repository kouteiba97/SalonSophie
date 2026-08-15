# BUILD BRIEF — N&S Beauty Platform

You are building a production web platform. Read this entire document, then follow §12.

---

## 1. THE BUSINESS

**The Sisters N&S** — a beauty business at UV5, Nouvelle Ville (next to Cirta School), Constantine, Algeria. Run by two sisters, **Nour** and **Sophie**, with reception staff and stylists. Phone: `0553366712`.

Three businesses sharing one address and one phone line:

1. **Salon** — hair, nails, facials, lash extensions, waxing, massage
2. **Bridal atelier** — wedding gown **rental** (not sale), plus accessories: barnous, diadème, veil
3. **Creator brand** — Sophie is a professional Instagram creator with paid brand partnerships

Today they run on a paper diary, one mobile number, and Sophie's memory. This platform replaces that.

**Two surfaces:**
- **Public site** — clients browse gowns and services, see prices, book appointments. Mobile-first: most traffic arrives from an Instagram reel on a mid-range Android phone over Algerian 4G.
- **Staff console** — reception books appointments, everyone sees the day, Sophie manages gown inventory and brand deals.

---

## 2. STACK

```
Next.js 15 (App Router) · TypeScript (strict) · Tailwind · shadcn/ui
Supabase — Postgres, Auth, Storage, Realtime, RLS
next-intl (fr default, ar, en) · Zod · React Hook Form · TanStack Query
Vitest + Testing Library · Playwright
Deploy: Vercel + Supabase
```

No React Three Fiber. No WebGL. No Stripe.

---

## 3. THE DESIGN FILE

A file named `Sisters_NS_Beauty_-_Standalone.html` accompanies this brief. It is the **approved visual design** and the visual source of truth.

It is a self-extracting bundle. To read it:
- Real source is gzipped base64 inside `<script type="__bundler/manifest">`
- Page markup is JSON-encoded inside `<script type="__bundler/template">`
- Component logic is the `<script type="text/x-dc" data-dc-script>` block — a class `Component extends DCLogic`

It targets an internal template runtime that does not exist in our stack. **Port it, don't reuse it:**

| Design construct | Port to |
|---|---|
| `<x-dc>` template + `DCLogic` class | React function components + hooks |
| `<sc-if value="{{ isFr }}">` | next-intl locale routing |
| `style-hover="..."` attribute | Tailwind `hover:` variants |
| Inline `style` on every element | Tailwind + CSS custom properties |
| `<image-slot id="...">` | `next/image` from Supabase Storage |
| `this.state` mega-object | Decomposed state (§5.2) |
| `this.hash()` fake availability | Real Supabase queries (§5.3) |

**Match the visual output exactly.** Same layout, same colours, same animation timings, same DOM order. Upgrade the engineering underneath (§5), never the aesthetics.

If the design file is unavailable, §4 contains everything needed to rebuild the visual system from scratch.

---

## 4. DESIGN SYSTEM — authoritative

Put in `globals.css` as custom properties, extend the Tailwind theme. **No raw hex in components.**

```css
--rose-deep:#8B6F7D;    --rose-mid:#A8899A;      --rose-dark:#7C6070;
--rose-soft:#C9A9A6;    --blush:#E8D5D0;         --blush-2:#EBD8CF;
--blush-3:#E2D0CB;      --tint:#F3EAE7;          --champagne:#D4B896;
--champagne-lt:#F0DCB8; --cream:#F7F3F0;         --cream-warm:#FBF8F7;
--charcoal:#2E2A28;     --ink-2:#5C534E;         --taupe:#A08D82;
--taupe-2:#7A6E68;      --line:#E7DEDA;          --muted:#C7BAB3;
--muted-2:#DAD1CB;      --white:#FFFFFF;
```

**Typography** — self-host all four via `next/font/local`, no Google Fonts requests:
- **Cormorant Garamond** — display headings, weights 300/400
- **Parisienne** — script accent, exactly one emphasised word per headline, never more
- **Jost** — body, weight 300, line-height 1.65
- **Noto Kufi Arabic** — Arabic, line-height 1.95

**Keyframes — port verbatim:**
- `nsWord` — headline words blur in: `opacity 0→1, blur(12px)→0, translateY(14px)→0`
- `nsReveal` — section reveal: `opacity 0→1, translateY(24px)→0`
- `nsFloat` — gold particles rising 260px, fading at 18%
- `nsFlicker` — neon sign flicker on load
- `nsSway` — pendant lights rotate ±1.1deg, infinite
- `nsKen` — Ken Burns, `scale(1.02)→(1.08)`

**Hero motion — damped CSS parallax, no 3D:**
- `mousemove` normalised to −1..1
- Damped lerp at **0.045** per frame in a single `requestAnimationFrame` loop
- Applied as `translate3d(-cx*16px, -cy*11px, 0) scale(1.0x)`
- Gated on `matchMedia('(pointer:fine)')` AND no `prefers-reduced-motion`
- Ken Burns drift is the touch / reduced-motion fallback
- Remove listeners and `cancelAnimationFrame` on unmount; pause via IntersectionObserver when hero scrolls out

**Global:** `scroll-behavior:smooth` · `::selection{background:#E8D5D0}` · 6px rose scrollbars · `prefers-reduced-motion` block collapsing all animation to `.01ms`.

**Sections and anchors:** `#top` (hero) · `#services` · `#mariee` (bridal) · `#tarifs` (full price list) · `#soeurs` (the sisters) · `#contact`

**Images needing real assets** (branded placeholder until supplied — never stock photos of another salon): `ns-hero-studio`, `ns-gown-anastasia`, `ns-gown-abir`, `ns-gown-ryma`, `ns-nour`, `ns-sophie`, `ns-map`

---

## 5. UPGRADES — fix these while porting

The design is a visual prototype with real defects. Fix each; do not reproduce them.

### 5.1 Architecture
1. Everything is inline-styled → extract to tokens + Tailwind.
2. One component holds the whole page → split into `Hero`, `ServicesGrid`, `BridalGallery`, `TariffAccordion`, `SistersSection`, `ContactSection`, `BookingModal`, `BeforeAfterSlider`, `LanguageSwitcher`.
3. Single page with anchors only → give every service and gown its own route: `/[locale]/services/[slug]`, `/[locale]/robes/[slug]`. A bride must be able to send her mother a link to one gown.

### 5.2 State
4. One mega-state object `{lang, cat, open, step, svc, expert, date, time, nm, ph, nt, mOff, wOff, q, grp}` → locale becomes a URL segment; category filter and search become URL query params (shareable, back button works); booking flow gets its own reducer; form fields go to React Hook Form + Zod.
5. Search has no debounce → debounce 250ms.

### 5.3 Booking correctness — critical
6. **Availability is faked with a string hash.** Delete `hash()`, `slotsOf()`, and `hash(iso)%11===0`. Real availability derives from `staff_schedules`, existing `appointments`, `staff_time_off`, and the service's real duration.
7. **Friday-closed is hardcoded** as `d.getDay()===5` → move to a `business_hours` table with per-day open/close plus exception dates.
8. No booking horizon → add minimum lead time and maximum advance window as config.
9. No server-side conflict check → optimistic UI is fine, but the server re-validates on submit inside a transaction. Two clients must never take one slot.
10. Bridal items are mixed into the service list → a gown in the booking flow creates a **fitting appointment**, not a rental. Rentals are date ranges, separate flow, separate table (§7).
11. No spam protection → rate-limit the public booking endpoint by IP and phone.

### 5.4 Accessibility
12. Booking modal has no focus trap, no Escape handler, no `aria-modal`, no scroll lock, no focus restore → use the shadcn Dialog primitive.
13. Step changes are silent to screen readers → `aria-live="polite"` announcing "Étape 3 sur 5".
14. Before/after slider is pointer-only → add keyboard (arrows ±2%, Home/End), `role="slider"`, `aria-valuenow`, visible focus ring.
15. Category chips and calendar cells must be real `<button>` elements with `aria-pressed` / `aria-selected`.
16. Disabled dates convey state by colour and strikethrough alone → add `aria-disabled` and a text reason ("Fermé", "Complet").
17. No skip link, no landmarks → add `<main>`, `<nav>`, `<footer>`, skip-to-content.
18. No form validation → Zod; Algerian mobile `0[5-7]\d{8}`; inline errors tied via `aria-describedby`.

### 5.5 Performance — budget: LCP < 2.5s on simulated 4G, CLS < 0.1
19. Images have no dimensions → `next/image` with explicit sizing; hero `priority` + blur placeholder; everything else lazy.
20. Animations run regardless of viewport → drive reveals with IntersectionObserver, `once: true`.
21. Parallax loop runs unconditionally → keep the `pointer:fine` gate, add IntersectionObserver pause.
22. Fonts → self-host (§4).

### 5.6 SEO and i18n
23. **Language switching is client-side only** — all three languages share one URL, so none are indexable. Move to `/[locale]/...` routing with `hreflang` alternates and per-locale metadata.
24. `dir` is set on a nested div → set `dir` and `lang` on `<html>`.
25. No metadata at all → per-page title/description/OG, plus `LocalBusiness`, `Service`, `Offer` JSON-LD. Target *location robe mariée Constantine*, *salon coiffure Ali Mendjeli*.

### 5.7 Missing states
26. No loading, empty, or error states; no error boundary; no 404 → add all, written in the brand's voice. An empty result invites an action; an error says what to do next.
27. No sticky mobile CTA → persistent "Réserver" bar after hero scroll, plus a WhatsApp float button.

---

## 6. THE CATALOGUE

Eight categories: **Coiffure · Soins Capillaires · Soin de Visage · Nails · Pédicure · Extension de Cils · Épilation · Massage**

Seed with the real published tariff (prices in DZD):

```
COIFFURE
Coupe 700 · Coupe+brushing courts 1200 · Coupe+brushing longs 1500
Brushing courts 1000 · Brushing mi-longs 1200 · Brushing longs 1500
Brushing très très longs 2000

SOINS CAPILLAIRES
Soins capillaires 14000–35000 (RANGE) · CCRP from 6000 · Balayage from 16000

SOIN DE VISAGE
Simple 3500 · Profond 5000 · Hydra Facial 8000 · Soin des mains 2500

NAILS
Pose capsule 4000 · Gel sur ongle naturel 3500 · Verni semi-permanent 2500
Remplissage 3500 · Dépose+manucure russe 2000 · Manucure russe 1000
French pose capsule 4500 · French gel ongle naturel 4000 · Babyboomer 5000
Déco +500 (add-on)

PÉDICURE
Capsule 3500 · Gel sur ongle naturel 3000 · Semi-permanent 2500
Soin sans paraffine 3000 · Soin avec paraffine 3500 · Peeling 5000

EXTENSION DE CILS
Effet naturel 4000 · Effet naturel mixte 5000 · Effet mixte 6500
Effet russe 8000 · Rehaussement 3500 · Rehaussement+teinture 4500
Brow lifting 3500 · Brow lifting+teinture 4500

ÉPILATION
Lèvre supérieure 200 · Sourcils 600 · Aisselles 600 · Demi-bras 1000
Visage sans sourcils 1000 · Ventre 1000 · Demi-jambes 1000 · Cuisse 1000
Bras 1800 · Jambes 2000 · Fessier 3000 · Dos 4000 · Maillot 4000

MASSAGE
Corps complet 7000 · Ventre et dos 4000 · Cuisses et mollets 4000
Visage OFFERT (free with any massage)
```

**Gowns:** Anastasia, ABir, RYMA — named inventory, each with a size range and tier (Essential / Signature / Couture). Sizes must be **visible on every gown card** — it is the most frequently asked question.

**Accessories:** barnous, diadème, veil — separate stock, rentable alongside a gown.

**Unknown data.** These are not yet known and must NOT be invented: service **durations**, bridal **rental prices**, bridal **package prices**, **opening hours**, full **staff list** (only Nour and Sophie are confirmed). Use `TODO_*` constants that render as `—` or `Sur devis` and log a build-time warning. A missing price is recoverable; a wrong one shown to clients is not.

---

## 7. SCHEMA

Standard columns on every table: `id uuid pk`, `tenant_id uuid`, `created_at`, `updated_at`. One tenant today — keep the column so a second location is not a rewrite.

```
locations · business_hours · users · roles · staff · staff_schedules · staff_time_off
service_categories · services · service_variants
appointments · appointment_services
clients · client_notes
gowns · gown_sizes · gown_reservations · gown_status_log
accessories · accessory_loans · contracts · deposits · payments
conversations · messages · saved_replies
content_posts · post_metrics · brand_deals · deliverables · invoices
reviews · audit_log
```

### The constraint that matters most

An appointment is a point in time. A gown rental is an **interval**, and one physical gown cannot be out twice at once. A double-booking is discovered on the wedding day and cannot be fixed. Enforce in Postgres, not application code:

```sql
create extension if not exists btree_gist;

create table gown_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  gown_id uuid not null references gowns(id),
  client_id uuid not null references clients(id),
  period daterange not null,          -- cleaning buffer days INSIDE the range
  status text not null default 'confirmed'
    check (status in ('held','confirmed','returned','cancelled')),
  created_at timestamptz default now(),
  exclude using gist (gown_id with =, period with &&)
    where (status in ('held','confirmed'))
);
```

**Gown states:** `available · rented · cleaning · repair` — four, not two. A gown in cleaning neither earns nor books. Log every transition to `gown_status_log`.

**Roles, enforced with RLS policies (not middleware):**
- `owner` — Nour, Sophie. Everything.
- `reception` — books appointments, manages clients, reads all calendars. **The primary daily user; optimise for booking speed.**
- `stylist` — own day and own clients only.

**Money:** integers in centimes, never floats. Services with a range need `price_min`/`price_max`, rendered `14 000 – 35 000 DA`. Format with `Intl.NumberFormat('fr-DZ')` → `16 000 DA`. Timestamps UTC, displayed `Africa/Algiers`.

---

## 8. INTERNATIONALISATION

Three locales: **`fr` (default) · `ar` · `en`**. Arabic is a first-class mode, not a translation layer.

- Extract every inline French and Arabic string from the design into message catalogues
- `dir` and `lang` on `<html>`; Arabic uses Noto Kufi Arabic at line-height 1.95 (Latin is 1.65)
- **Logical properties only** — `ms-`/`me-`, `ps-`/`pe-`, `start`/`end`. Never `ml-`/`mr-`/`left`/`right`.
- Dates via `toLocaleDateString` with `ar-DZ` / `fr-FR` / `en-GB`
- **Test every screen in Arabic before English.** If it only looks right in English, it isn't done.

---

## 9. BOOKING FLOW

Five steps, exactly as designed:
**Le service → Votre experte → Date & heure → Vos coordonnées → Confirmation**

Keep both calendar views: the 42-cell month grid (desktop) and the 7-day strip with paging (mobile).

On confirm: persist inside a transaction, send WhatsApp confirmation, return a reference number.

---

## 10. INTEGRATIONS

- **WhatsApp Business Cloud API** — reminders at booking, 24h, and 2h. The real communication channel in Algeria.
- **Instagram Graph API** — DMs, comments, post metrics.
- **Payments** — deposit + cash-on-arrival first. CIB / Edahabia (SATIM) later.

API approval may take weeks. **The entire core — bookings, gowns, clients — must work with zero social integration.** Build these behind an adapter interface with a manual fallback so nothing blocks on Meta approval.

---

## 11. BUILD ORDER

Approval gate between every phase. Do not start the next until confirmed.

| Phase | Deliverable |
|---|---|
| **1** | Public site ported with all §5 upgrades. Real routing, real i18n, booking UI complete, data seeded statically. **This is what gets shown to the client — it must be flawless.** |
| **2** | Supabase schema, auth, RLS. Seed the §6 catalogue and gowns. Wire services and tariff to the database. |
| **3** | Real booking: availability engine, server-side conflict prevention, confirmations, WhatsApp reminders. |
| **4** | Bridal atelier (staff): gown reservations with the exclusion constraint, four states, accessories, fittings, contracts, utilisation per gown. |
| **5** | Staff console — see §13. |
| **6** | Client CRM, unified inbox, brand-deal pipeline. |

---

## 12. NON-NEGOTIABLES

1. Gown double-booking impossible **at the database level**.
2. No invented prices, durations, or staff — `TODO_*` and a build warning instead.
3. Arabic RTL correct on every screen, tested before English.
4. LCP < 2.5s on 4G, CLS < 0.1. No WebGL. No parallax on touch devices.
5. RLS on every table — reception can't see brand deals, stylists can't see other stylists' clients.
6. Zod validation at every boundary. Server re-validates every booking.
7. No secrets in client bundles.
8. Keyboard navigable including slider and calendar. Visible focus. WCAG AA.
9. `audit_log` on every mutation to appointments, reservations, payments.
10. Visual output identical to the design. **Upgrade the engineering, not the aesthetics.**

---

## 13. STAFF CONSOLE (Phase 5 reference)

Sidebar: Today · Bridal Atelier · Clients · Services & Prices · Brand Deals. Same design tokens as the public site. Trilingual with full RTL.

**Signature view — the day-line.** Three horizontal lanes (Salon / Bridal / Makeup) on one 09:00–19:00 timeline. Each appointment is a positioned block showing client and service; click for detail with a WhatsApp button. Today all three businesses share one phone and exist only in someone's memory — this view puts the whole operation in a single glance. It is the most important screen in the console.

Above it: KPI cards for booked revenue today, appointment count, gowns out, and **unanswered messages** (styled as an alert — unanswered client messages are a known failure).

**Bridal Atelier:** gown cards with name, silhouette, tier, visible sizes, one of four states, and lifetime rental count for utilisation. Accessory stock with in/out counts.

**Clients:** unified list across all three business lines, with a bride flag, visit count, lifetime spend, and free-text notes (colour formulas, allergies, wedding dates).

**Brand Deals:** four-column kanban — pitched → negotiating → contracted → delivered — with deal value and next deliverable.

**New appointment:** four-step modal — business line → service → staff → time slot + client details.

---

## 14. HOW TO WORK

Small commits, one concern each, conventional messages. **Ask before assuming** — if a business rule is unclear (deposit amounts, cancellation windows, how far ahead a gown can be held), stop and ask rather than inventing policy. Write tests for the rules that hurt when broken: gown overlap, appointment conflicts, RLS boundaries. Playwright end-to-end for two flows: booking a salon appointment, reserving a gown. Seed realistically — an empty app cannot be evaluated. After each phase, run the build and tests, then summarise what shipped and what you would flag.

---

## START HERE

1. Decode the design bundle (§3) and confirm you can see the real markup and component logic.
2. Write `CLAUDE.md` at the repo root: stack, conventions, §4 tokens, §12 non-negotiables.
3. Propose the Phase 1 file structure.
4. List the business rules you need answered before writing code.

Then stop and wait for approval.
