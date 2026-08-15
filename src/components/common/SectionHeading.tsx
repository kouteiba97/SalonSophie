import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  /**
   * The one word set in Parisienne. Exactly one emphasised word per headline, never more
   * (BUILD_BRIEF §4).
   */
  accent?: string;
  lead?: string;
  className?: string;
  align?: 'start' | 'center';
  /** Rendered as h1 on detail pages, h2 in page sections. */
  as?: 'h1' | 'h2';
  tone?: 'default' | 'onDark';
}

export function SectionHeading({
  eyebrow,
  title,
  accent,
  lead,
  className,
  align = 'start',
  as: Tag = 'h2',
  tone = 'default',
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex max-w-[62ch] flex-col gap-3',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-[11px] uppercase tracking-[.28em]',
          tone === 'onDark' ? 'text-blush' : 'text-taupe',
        )}
      >
        <span aria-hidden className="text-champagne">
          ✦
        </span>
        {eyebrow}
      </p>

      <Tag
        className={cn(
          'font-display text-[clamp(30px,4.4vw,52px)] font-light leading-[1.06] tracking-[-.015em] text-balance',
          tone === 'onDark' ? 'text-cream' : 'text-charcoal',
        )}
      >
        {title}
        {accent ? (
          <>
            {' '}
            <span className="font-script text-[1.16em] font-normal leading-none text-rose-deep">
              {accent}
            </span>
          </>
        ) : null}
      </Tag>

      {lead ? (
        <p className={cn('text-[15px] leading-[1.75]', tone === 'onDark' ? 'text-blush-3' : 'text-ink-2')}>
          {lead}
        </p>
      ) : null}
    </div>
  );
}
