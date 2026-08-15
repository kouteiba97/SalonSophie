# Open questions

Business rules nobody has answered yet. Everything here is **deliberately unimplemented** — the
code renders `—` or "Sur devis" instead of a plausible-looking value.

> A missing price is recoverable; a wrong one shown to a client is not.
> — BUILD_BRIEF §6

The design file `Sisters NS Beauty - Standalone.html` contains a confident-looking answer to
almost every question below. **Those are prototype filler, not business data.** Several of them
contradict the brief outright — it claims fifteen beauty experts when only Nour and Sophie are
confirmed, and prices a balayage at 7 500 DA when the published tariff floor is 16 000. Do not
copy values out of it. Its layout, tokens, keyframes and DOM order *are* authoritative.

Everything unknown flows through `src/lib/todo.ts`, which prints the full list at build time.

---

## Blocking a client showing

These appear on screens a client will look at.

### 1. Opening hours
The design showed "Samedi – Jeudi, 09 h 00 – 19 h 00 / Vendredi Fermé". Invented.

Also blocks the availability engine: with no hours it cannot compute a single slot, so **every
booking is currently a *request*** rather than a confirmed appointment.

- Which days is the salon open, and what hours?
- Does it close on Friday? (The design hardcoded it; the schema does not assume it.)
- Any regular exceptions — Ramadan hours, a weekly half-day?

**Where it goes:** `business_hours` rows (per weekday) and `business_hour_exceptions` (per date).
Both tables exist and ship empty. Nothing else needs changing.

### 2. Service durations
Unknown for all 55 services. The design invented "45 min", "2 h" and so on.

Needed for the availability engine to size a slot. Until then, services with no duration produce
requests, not bookings.

**Where it goes:** `services.duration_minutes`, currently null for every row.
Optionally `services.buffer_minutes` for turnaround between clients.

### 3. Bridal rental prices
The design invented 38 000 / 45 000 / 55 000 DA for ABir / Anastasia / RYMA.

- Price per gown, and is it a flat rental or does it vary by rental length?

**Where it goes:** `gowns.rental_price` (centimes), currently null.

### 4. Bridal package prices and contents
The design invented 65 000 / 95 000 / 140 000 DA, and bullet lists including
"Location robe (3 jours)" and "Retouches sur place le jour J".

Contents are policy, not copy — how long a gown goes out for is a business rule.

- What is in Essential, Signature and Couture, and what does each cost?

**Where it goes:** currently `BRIDAL_PACKAGES` in `src/data/bridal.ts`; deserves its own table
when the answers arrive.

### 5. Client testimonials
The design shipped three quotes attributed to named clients — "Meriem B. — Mariée, juin 2025",
"Yasmine K.", "Lamia T. — Cliente fidèle depuis 2023" — each with a specific story and date.

Publishing invented testimonials under real-sounding names on a real business's site is the same
failure as inventing a price, with consumer-protection consequences attached. The section renders
its empty state instead, inviting real reviews.

- Are these real clients who consented? If not, they stay out.

**Where it goes:** the `reviews` table. `is_published` and `consent_given` are separate columns
on purpose, and a check constraint forbids publishing without consent.

### 6. Instagram accounts
The design listed `@thesisters.ns`, `@ns.institut`, `@ns.mariee`, `@ns.hair`, all linking to
bare `instagram.com`. Unverified, so no link is rendered.

- Which accounts are real, and which is the primary one?

### 7. Photography — 21 image slots
No real assets exist. Everything renders a branded placeholder (the monogram on the house
gradient), sized so the real photo drops in without shifting layout.

Never stock photos of another salon (§4). Slots: hero, 3 gowns, Nour, Sophie, a before/after
pair, 3 transformations, 3 testimonial avatars, 6 Instagram tiles, the map.

### 8. The hero and sisters figures
The design claimed "500+ Clientes heureuses · 15+ Expertes beauté · 8+ Ans d'excellence" and
"2018 · 340 k Communauté Instagram · 180+ Mariées accompagnées". The staff count contradicts §6,
which makes the rest untrustworthy. All removed.

- Are any of these real and quotable?

---

## Blocking Phase 4 (bridal atelier)

### 9. Deposit
- How much to hold a gown — a fixed amount, or a percentage?
- Is it refundable, and until when?

**Where it goes:** `gown_reservations.deposit_amount`, `deposits`.

### 10. Cancellation window
- How late can a bride cancel, and what does she lose?

### 11. Cleaning buffer
- How many days does a gown need between rentals?

The buffer belongs **inside** the reserved date range, so the exclusion constraint protects it
(`gown_reservations.cleaning_buffer_days` records it for transparency). Currently defaults to 0,
which means no turnaround is protected.

### 12. How long a hold survives
A `held` reservation blocks a gown exactly like a confirmed one.

- How long before an unconfirmed hold auto-releases?

### 13. Fitting duration
- How long is a gown fitting? Needed to schedule fittings as real appointments rather than
  requests. (The design claimed one hour.)

---

## Smaller decisions, worth confirming

### 14. Booking horizon
Placeholders in `BOOKING_HORIZON` (`src/data/business.ts`): **24 hours** minimum lead time,
**90 days** maximum advance. Both invented by me as sane defaults, not given by the business.

### 15. Can one appointment carry several services?
The schema supports it (`appointment_services`); the booking UI offers one at a time.

### 16. Should reception record payments?
Currently `payments` and `deposits` are **owner-only** under RLS. Reception takes cash at the
desk, so they may need write access — left as an explicit decision rather than a default grant.

### 17. Should a cancelled appointment still reveal the client to that stylist?
Currently **yes**: a stylist can see any client they have an appointment with, including a
cancelled one, on the grounds they may need to follow up. Easy to narrow to completed only.

### 18. Arabic copy needs a native review
The design translated ~17 strings; the rest of `messages/ar.json` was translated as part of this
build so that "Arabic correct on every screen" (§12.3) could actually be tested. It is sound
Modern Standard Arabic in the feminine address the design established — but register and warmth
are a brand decision, not a linguistic one.

See `messages/TRANSLATION_STATUS.md` for exactly what came from the design and what was dropped.

### 19. Gown silhouette lines
Kept from the design ("Traîne cathédrale, dentelle rebrodée main, dos boutonné" etc.) because §13
lists silhouette as a real gown field and §6 does not call it unknown. Still worth checking
against the actual dresses.

---

## Answered

- **Phone.** One line: `0553366712` → `+213553366712` → `wa.me/213553366712`.
  The design's `+213 661 23 45 67` is a placeholder and must never ship. A test asserts it.
- **Staff.** Only Nour and Sophie are confirmed. The design's "Amina" and "Lynda" are not
  reproduced; booking offers the two sisters plus "Sans préférence".
- **The tariff.** All 55 services across 8 categories are real (BUILD_BRIEF §6) and seeded.
- **Gowns.** Anastasia (36–42, Signature), ABir (38–44, Essential), RYMA (36–40, Couture).
  Sizes are visible on every card — §6 calls it the most-asked question.
