import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandedImageProps {
  /** Design slot id, e.g. `ns-gown-anastasia`. Kept so real assets can be dropped in by name. */
  id: string;
  alt: string;
  /** Supplied once real photography exists; until then a branded placeholder renders. */
  src?: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Rounded corners etc. applied to the frame. */
  frameClassName?: string;
}

/**
 * Every image on the site goes through here.
 *
 * No real photography exists yet, and BUILD_BRIEF §4 is explicit that stock photos of another
 * salon are never acceptable. So the fallback is a *branded* placeholder — the monogram on the
 * house gradient — which reads as deliberate rather than broken, and reserves the exact box the
 * real photo will occupy so swapping it in cannot shift layout (CLS budget, §12.4).
 *
 * Phase 2 passes `src` from Supabase Storage and this becomes a plain next/image.
 */
export function BrandedImage({
  id,
  alt,
  src,
  width,
  height,
  priority = false,
  sizes,
  className,
  frameClassName,
}: BrandedImageProps) {
  if (src) {
    return (
      <div className={cn('relative overflow-hidden', frameClassName)}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          sizes={sizes}
          className={cn('h-full w-full object-cover', className)}
        />
      </div>
    );
  }

  return (
    <div
      data-image-slot={id}
      role="img"
      aria-label={alt}
      style={{ aspectRatio: `${width} / ${height}` }}
      className={cn(
        'relative grid w-full place-items-center overflow-hidden',
        'bg-[linear-gradient(135deg,var(--color-blush-2)_0%,var(--color-tint)_45%,var(--color-blush-4)_100%)]',
        frameClassName,
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-45 bg-[radial-gradient(circle_at_28%_22%,var(--color-white)_0%,transparent_46%)]"
      />
      <span className="relative flex flex-col items-center gap-1.5">
        <span className="font-display text-[clamp(22px,3.4vw,34px)] font-light leading-none tracking-[.18em] text-rose-deep/70">
          N<span className="font-script text-champagne">&amp;</span>S
        </span>
        <span className="text-[9px] uppercase tracking-[.34em] text-taupe/70">Constantine</span>
      </span>
    </div>
  );
}
