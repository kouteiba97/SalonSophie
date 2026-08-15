# Translation status

## Where the copy came from

The approved design carried a **French-only** site with a thin trilingual shell. Measured across
the decoded markup: 5 837 characters of text, of which 295 were Arabic — about **5 %**.

Exactly these 17 strings existed in Arabic and English in the design, and are reproduced verbatim:

- the six nav items, and the `Réserver` button
- hero eyebrow, headline, sub-headline
- the two hero CTAs (`Réserver mon rendez-vous`, `Voir le studio`)
- the four trust badges
- the hero booking card (title + subtitle)
- `Choisir date & heure`

Everything else — the whole services section, the tariff, bridal, the sisters, transformations,
contact, footer, and the entire five-step booking flow — existed only in French.

## What was done

The remaining French copy was translated into Arabic and English so that §12.3 ("Arabic RTL
correct on every screen, tested before English") is actually testable. Arabic uses the same
feminine address the design established (`احجزي`, `موعدكِ`), Modern Standard Arabic, with
Algerian place names transliterated as locally written (علي منجلي، قسنطينة).

**These translations need a native Algerian Arabic reader's review before launch.** They are
sound MSA, but register and warmth are a brand decision, not a linguistic one — and the site's
voice is the whole point of the design.

## What was deliberately NOT translated

Copy that asserted business facts nobody has confirmed was dropped rather than carried into
three languages. Translating an unverified claim just multiplies it. See `src/lib/todo.ts`.

| Dropped from the design | Why |
|---|---|
| `500+ Clientes heureuses · 15+ Expertes beauté · 8+ Ans d'excellence` | The staff count contradicts §6 — only Nour and Sophie are confirmed |
| `2018 · 340 k Communauté Instagram · 180+ Mariées accompagnées` | Unverified figures |
| `Vingt-deux robes en stock, dont onze exclusivités` | §6 names three gowns |
| `l'institut réunit quinze expertes` (sisters bio, ¶1) | Same contradiction; the whole paragraph is unverifiable history |
| `Samedi – Jeudi 09 h 00 – 19 h 00 · Vendredi Fermé` | §6: opening hours unknown |
| `+213 661 23 45 67` | Placeholder; the real line is 0553366712 |
| Three named testimonials (Meriem B., Yasmine K., Lamia T.) | Invented quotes attributed to named clients |
| Package inclusion bullets (`Location robe (3 jours)`, …) | Policy claims — rental length is a business rule, not copy |
| `Tarifs 2026`, `TTC` | A year label that dates the page, and an unconfirmed tax claim |
| Per-service marketing copy (`sans ammoniaque`, `plus de 60 teintes`, `Tenue 3 à 4 mois`) | Product claims about goods we have no spec for |
| `Toutes nos photos sont brutes, sans retouche de peau` | A claim about photos that do not exist yet |
| `@thesisters.ns` and the three other handles | Unverified accounts |

Gown silhouette lines (`Traîne cathédrale, dentelle rebrodée main, dos boutonné`) were **kept** —
§13 lists silhouette as a real gown field, and the brief does not list it among the unknowns.
They should still be confirmed against the actual dresses.

## Adding a translation

Keys are identical across the three files. `fr.json` is the reference: if a key exists there it
must exist in `ar.json` and `en.json`. Run `npm test` — a test asserts the three catalogues have
matching key sets, so a missed translation fails the build rather than rendering a raw key at a
client.
