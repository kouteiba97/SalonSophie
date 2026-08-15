'use client';

import { useTranslations } from 'next-intl';
import { useBooking } from '../BookingProvider';
import { EXPERTS, NO_PREFERENCE } from '@/data/team';
import { cn } from '@/lib/utils';

/**
 * Step 2 — the expert.
 *
 * The design offered four: Nour, Sophie, "Amina — Nails & cils" and "Lynda — Massage & épilation".
 * Only the first two are confirmed to exist (§6), so the other two are gone and a no-preference
 * option takes their place — which is also the honest default while the roster is unknown, and
 * the fastest path for a client who does not care who does her nails.
 */
export function ExpertStep() {
  const t = useTranslations('booking');
  const team = useTranslations('team');
  const { state, dispatch } = useBooking();

  const options = [
    ...EXPERTS.map((expert) => ({
      slug: expert.slug,
      name: expert.name,
      role: team(`${expert.slug}.role` as 'nour.role' | 'sophie.role'),
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
