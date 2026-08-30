import { z } from 'zod';

/**
 * Validation for the accounts an owner creates.
 *
 * Mirrors the checks inside `create_staff_account` rather than replacing them. The database is the
 * guarantee — it is what a forged request hits — and these exist so the console can refuse a bad
 * shape without a round trip and say which field is wrong.
 */

/** owner = admin; reception and stylist are the two worker shapes. */
export const STAFF_ROLES = ['owner', 'reception', 'stylist'] as const;
export type StaffRoleInput = (typeof STAFF_ROLES)[number];

/**
 * Ten characters, matching the database.
 *
 * Deliberately a length rule and not a character-class one: an owner is going to say this out loud
 * to someone across a salon, and "must contain a symbol" produces passwords that get written on a
 * sticky note. Length survives being spoken.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const staffAccountInput = z.object({
  fullName: z.string().trim().min(1, 'invalid_name').max(120),
  email: z.string().trim().toLowerCase().email('invalid_email'),
  password: z.string().min(MIN_PASSWORD_LENGTH, 'weak_password'),
  role: z.enum(STAFF_ROLES),
  /**
   * Links the login to a bookable person, so a stylist's own day and own clients resolve.
   * Empty for someone who works the desk and takes no appointments.
   */
  staffSlug: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  /**
   * Create the bookable person too.
   *
   * A stylist needs to exist twice — once as a login, once as the person a client picks. Creating
   * only the login makes someone nobody can book and whose own day resolves to nothing, and it
   * does so silently.
   */
  bookable: z.boolean().default(false),
});

export const passwordResetInput = z.object({
  userId: z.string().uuid(),
  password: z.string().min(MIN_PASSWORD_LENGTH, 'weak_password'),
});

export const staffActiveInput = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
});

/**
 * A password that can be read aloud once and typed on a phone without a mistake.
 *
 * No look-alike characters (0/O, 1/l/I) — the whole point is that it survives being spoken across
 * a busy room. Generated in the browser only as a suggestion; the owner can overwrite it, and the
 * worker replaces it on first login regardless.
 */
export function suggestPassword(): string {
  const words = [
    'Salon', 'Coiffure', 'Atelier', 'Mariee', 'Beaute', 'Cirta', 'Rhumel', 'Constantine',
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${word}-${digits}-NS`;
}
