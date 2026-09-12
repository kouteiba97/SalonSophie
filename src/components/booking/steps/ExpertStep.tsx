'use client';

import { useTranslations } from 'next-intl';
import { useBooking } from '../BookingProvider';
import { NO_PREFERENCE } from '@/data/team';
import { cn } from '@/lib/utils';

/**
 * Step 2 — the expert.
 *
 * The design offered four: Nour, Sophie, "Amina — Nails & cils" and "Lynda — Massage & épilation".
 * The last two were invented, and are still not reproduced — but the roster no longer comes from
 * a constant either. It is read from `staff`, so whoever an owner has actually hired appears
 * here, and §6 is satisfied by the salon's own record rather than by a list of two.
 *
 * That list of two had become the bug it was written to prevent. A stylist hired through
 * `/equipe` was bookable in the database, had a schedule, and could never be chosen by a client,
 * because this step did not read the table she was in.
 *
 * The role line is optional on purpose. The seeded two have a translated one; somebody hired last
 * week has `specialty` if an owner filled it in and nothing if they did not, and a blank line is
 * more honest than inventing a job title for a real person.
 */
export function ExpertStep() {
  const t = useTranslations('booking');
  const team = useTranslations('team');
  const { state, dispatch, catalogue } = useBooking();

  const options = [
    ...catalogue.team.map((expert) => ({
      slug: expert.slug,
      name: expert.name,
      role: expert.roleKey
        ? team(`${expert.slug}.role` as 'nour.role' | 'sophie.role')
        : (expert.specialty ?? ''),
      initial: expert.name.charAt(0),
    })),
    {
      slug: NO_PREFERENCE,
      name: team('noPreference.name'),
      role: team('noPreference.role'),
      initial: '✦',
    },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="sr-only">{t('chooseExpert')}</h3>
      {options.map((option) => {
        const selected = state.expertSlug === option.slug;
        return (
          <button
            key={option.slug}
            type="button"
            onClick={() => dispatch({ type: 'selectExpert', slug: option.slug })}
            aria-pressed={selected}
            className={cn(
              'flex w-full cursor-pointer items-center gap-4 rounded-[18px] border px-5 py-[15px] text-start transition-colors duration-200',
              selected
                ? 'border-rose-deep bg-tint'
                : 'border-rose-soft/40 bg-white hover:border-rose-deep/60',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-full font-display text-[18px] font-light',
                selected ? 'bg-rose-deep text-white' : 'bg-tint text-rose-deep',
              )}
            >
              {option.initial}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] text-charcoal">{option.name}</span>
              <span className="truncate text-[12px] text-taupe-2">{option.role}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
