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

This is the highest-leverage unknown on the list. The console's **Prestations** screen shows the
count of services still missing one, because filling them in is what turns every booking from a
request the salon has to chase into a slot the client can actually take — and it is also what
lets the day-line draw a real block instead of a pin.

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

## Still unanswered in the bridal atelier (Phase 4 is built around these gaps)

Phase 4 shipped without answers to any of these. Nothing below is a blocker any more — the
console works, and each unknown surfaces as a blank field or a visible zero that invites the
question. That is the point: a plausible default here would never be questioned again.

### 9. Deposit
- How much to hold a gown — a fixed amount, or a percentage?
- Is it refundable, and until when?

**Where it goes:** `gown_reservations.deposit_amount`, `deposits`.

**How it behaves today:** the reservation form has a deposit field in dinars, left blank by
default. Blank stores NULL, and NULL renders "Non défini" — never `0 DA`, which would read as a
decision to take no deposit. Refundability is not modelled at all; `deposits.refunded_at` exists
and nothing sets it.

### 10. Cancellation window
- How late can a bride cancel, and what does she lose?

**How it behaves today:** an owner can cancel at any time, and the dates are released the
instant they do. No penalty, no window, no record of what was forfeited — because all three are
policy. The cancellation asks for confirmation and appends the reason to the reservation's notes.

### 11. Cleaning buffer
- How many days does a gown need between rentals?

The buffer belongs **inside** the reserved date range, so the exclusion constraint protects it
(`gown_reservations.cleaning_buffer_days` records it for transparency).

**How it behaves today:** the form asks per reservation and defaults to **0**, so no turnaround
is protected unless someone types a number. Zero is visibly wrong to anyone who knows the answer,
which is why it is the default rather than a sensible-looking 2.

### 12. How long a hold survives
A `held` reservation blocks a gown exactly like a confirmed one.

- How long before an unconfirmed hold auto-releases?

**How it behaves today:** it does not. A hold blocks the dress until someone confirms or cancels
it by hand. No expiry column was added and no job sweeps them, because "seven days" would be an
invented rule that quietly starts releasing real brides' dresses. The reservations list filters
by status so held ones can be found and chased.

### 13. Fitting duration
- How long is a gown fitting? Needed to schedule fittings as real appointments rather than
  requests. (The design claimed one hour.)

**How it behaves today:** unchanged from Phase 3 — choosing a gown in the public booking flow
creates a fitting *request*, never a held slot.

### 20. Should returning a gown put it in `cleaning`? *(new, from building Phase 4)*
Marking a reservation `returned` moves the gown from `rented` to `cleaning`, and it stays there
until someone marks it `available`. That was a judgement call: the dress is physically back and
has been worn, which is a fact rather than a policy — but "every returned gown needs cleaning
before the next bride" is an assumption about how the atelier works, and it is one click to
undo, not zero.

- Is that the real workflow, or do some dresses go straight back on the rail?

### 22. The day-line's hours *(new, from building Phase 5)*
The design's day-line ran 09:00–19:00. Those hours are invented (§6, question 1), so the console
derives its scale instead: from `business_hours` when it is filled in, otherwise from the
appointments actually in the book, and with neither it says there is nothing to draw.

The derived scale is honest but not free — it means the timeline's width changes shape from one
day to the next, which is a slightly odd thing to look at every morning. Answering question 1
fixes that as a side effect.

### 21. Accessory stock counts *(new, from building Phase 4)*
`accessories.stock_total` is 0 for barnous, diadème and voile — the seed never had real counts.
The console reads 0 as **"not counted yet"** and allows any number of loans; the moment a real
count is entered, overlapping loans beyond it are refused.

- How many of each does the salon actually own?

---

## Smaller decisions, worth confirming

### 14. Booking horizon
Placeholders in `BOOKING_HORIZON` (`src/data/business.ts`): **24 hours** minimum lead time,
**90 days** maximum advance. Both invented by me as sane defaults, not given by the business.

### 15. Can one appointment carry several services?
The schema supports it (`appointment_services`); the booking UI offers one at a time.

### 16. Should reception record payments — and take reservations?
Currently `payments` and `deposits` are **owner-only** under RLS. Reception takes cash at the
desk, so they may need write access — left as an explicit decision rather than a default grant.

Phase 4 made the same question concrete for the atelier: reception can see every reservation and
can create none. If a bride walks in while Nour and Sophie are both with clients, reception can
answer "is it free?" and nothing else. Widening it is one policy —
`gown_reservations_owner_write` — not a code change.

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
