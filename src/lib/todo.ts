/**
 * The single chokepoint for business data nobody has given us yet — BUILD_BRIEF §6, §12.2.
 *
 *   "A missing price is recoverable; a wrong one shown to clients is not."
 *
 * The design file contains plausible-looking invented values for every field listed in
 * UNKNOWN_FIELDS below (durations like "45 min", gown rentals at 45 000 DA, opening hours,
 * two staff members who may not exist). Those are prototype filler. Anything we do not
 * genuinely know is represented by a TodoValue, which renders as an em dash or "Sur devis"
 * and is impossible to mistake for real data.
 *
 * Every TodoValue constructed is registered, and the set is printed once per build so the
 * gap stays visible instead of quietly shipping.
 */

/*
 * A string, not a Symbol.
 *
 * This was `Symbol('ns.todo')`, which is the usual way to brand a type — and it silently broke
 * the one guarantee this module exists for. Symbol-keyed properties do not survive serialisation
 * across the Server/Client boundary, so a TodoValue handed to a Client Component arrived as a
 * plain `{ field, source }`, `isTodo` returned false, and `formatPrice` fell through its switch
 * and rendered *nothing* where "Sur devis" belonged. The booking modal showed brides a gown with
 * a blank price while the card behind it, rendered on the server, said "Sur devis" correctly.
 *
 * A string key crosses the wire intact. The `__` prefix keeps it out of the way of real data.
 */
const TODO_BRAND = '__nsTodo';

export interface TodoValue {
  readonly __nsTodo: true;
  /** Which piece of business data is missing, for the build warning. */
  readonly field: string;
  /** Who needs to supply it, so the warning is actionable. */
  readonly source: string;
}

/** A value that is either known, or explicitly not yet known. */
export type Unless<T> = T | TodoValue;

const registry = new Map<string, TodoValue>();

export function todo(field: string, source = 'Nour / Sophie'): TodoValue {
  const existing = registry.get(field);
  if (existing) return existing;
  const value: TodoValue = { [TODO_BRAND]: true, field, source };
  registry.set(field, value);
  return value;
}

/**
 * True for a value we were never given.
 *
 * Tests the brand's *value*, not merely its presence: a serialised TodoValue keeps both, so this
 * holds on the client as well as the server. That equivalence is what `todo.test.ts` pins down —
 * it is the property whose absence rendered blank prices to brides.
 */
export function isTodo(value: unknown): value is TodoValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[TODO_BRAND] === true
  );
}

/** Narrow an `Unless<T>` to `T`, or fall back. */
export function known<T>(value: Unless<T>, fallback: T): T {
  return isTodo(value) ? fallback : value;
}

/* ---------------------------------------------------------------------------------------------
   The unknowns, named once. Import these rather than calling todo() ad hoc.
   --------------------------------------------------------------------------------------------- */

/** §6: service durations are not known. The design invented "45 min", "2 h" etc. */
export const TODO_SERVICE_DURATION = todo('Durée des prestations');

/** §6: bridal rental prices are not known. The design invented 38 000 / 45 000 / 55 000 DA. */
export const TODO_GOWN_RENTAL_PRICE = todo('Tarifs de location des robes');

/** §6: bridal package prices are not known. The design invented 65 000 / 95 000 / 140 000 DA. */
export const TODO_PACKAGE_PRICE = todo('Tarifs des forfaits mariée');

/** §6: opening hours are not known. The design invented "Samedi – Jeudi, 09 h – 19 h". */
export const TODO_OPENING_HOURS = todo('Horaires d’ouverture');

/** §6: only Nour and Sophie are confirmed. The design invented "Amina" and "Lynda". */
export const TODO_STAFF_LIST = todo('Liste complète de l’équipe');

/**
 * Not in §6, found while decoding the design: three testimonials attributed to named clients
 * ("Meriem B.", "Yasmine K.", "Lamia T.") with specific dates and stories. Publishing invented
 * quotes attributed to real-sounding people is the same failure as inventing a price, with
 * consumer-protection consequences on top. Held until real, consented reviews exist.
 */
export const TODO_TESTIMONIALS = todo('Avis clientes vérifiés');

/** Instagram handles shown in the design are unverified. */
export const TODO_INSTAGRAM_HANDLES = todo('Comptes Instagram officiels');

/**
 * The hero strip claimed "500+ Clientes heureuses · 15+ Expertes beauté · 8+ Ans d'excellence".
 * The middle figure contradicts §6 outright, which makes the other two untrustworthy too.
 */
export const TODO_HERO_STATS = todo('Chiffres clés (clientes, équipe, années)');

/**
 * The sisters' first paragraph dated the salon to 2018, sized the first room at thirty square
 * metres, and again claimed fifteen experts; the stat row added "340 k" Instagram followers and
 * "180+" brides. All unverifiable, so the section keeps only the paragraph describing who does
 * what — which §1 does confirm.
 */
export const TODO_SISTERS_HISTORY = todo('Histoire du salon et chiffres (année, communauté, mariées)');

/** The showroom card claimed "vingt-deux robes en stock, dont onze exclusivités"; §6 names three. */
export const TODO_GOWN_INVENTORY_COUNT = todo('Inventaire réel des robes');

/** Package contents are policy, not copy — "Location robe (3 jours)" is a rule nobody confirmed. */
export const TODO_PACKAGE_CONTENTS = todo('Contenu des forfaits mariée');

export const UNKNOWN_FIELDS = [
  TODO_SERVICE_DURATION,
  TODO_GOWN_RENTAL_PRICE,
  TODO_PACKAGE_PRICE,
  TODO_PACKAGE_CONTENTS,
  TODO_OPENING_HOURS,
  TODO_STAFF_LIST,
  TODO_TESTIMONIALS,
  TODO_INSTAGRAM_HANDLES,
  TODO_HERO_STATS,
  TODO_SISTERS_HISTORY,
  TODO_GOWN_INVENTORY_COUNT,
] as const;

/**
 * Printed once at build/boot. Not an error — the site is meant to run with these missing —
 * but it must never become invisible.
 */
let warned = false;
export function warnUnknownData(): void {
  // Server-side only. This is a note to us, not to a client with devtools open.
  if (typeof window !== 'undefined') return;
  if (warned || process.env.NODE_ENV === 'test') return;
  warned = true;
  const lines = UNKNOWN_FIELDS.map((t) => `    • ${t.field}  →  ${t.source}`).join('\n');
  console.warn(
    `\n  [N&S] ${UNKNOWN_FIELDS.length} champs métier inconnus — rendus « — » ou « Sur devis ».\n` +
      `  Ils ne doivent pas être inventés (BUILD_BRIEF §6, §12.2).\n${lines}\n`,
  );
}

warnUnknownData();
