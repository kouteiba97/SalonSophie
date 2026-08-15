'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Stagger, in ms, for grids of cards. */
  delay?: number;
  id?: string;
}

/**
 * Section reveal, driven by IntersectionObserver with `once: true` (BUILD_BRIEF §5.5 item 20).
 *
 * The design used `animation-timeline: view()`, which runs the animation continuously as the
 * element crosses the viewport — it never stops re-running, and it is unsupported on much of
 * the mid-range Android install base this site is built for. Observing once, then disconnecting,
 * gives the same visual with none of the cost.
 */
export function Reveal({ children, className, as: Tag = 'div', delay = 0, id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour reduced motion by showing content immediately rather than animating it in.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.dataset.revealed = 'true';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.style.animationDelay = `${delay}ms`;
          target.dataset.revealed = 'true';
          observer.unobserve(target);
        }
      },
      {
        /**
         * `threshold: 0` — deliberately a pixel trigger, not a ratio.
         *
         * A ratio is measured against the element, and these are whole page sections: the
         * services grid is over 4 000px tall, so a threshold of 0.06 demanded ~246px of it be
         * on screen before it faded in. Scrolling its heading into view showed nothing, which
         * is precisely the blank-page-below-the-hero failure this replaces. With a zero
         * threshold the section reveals as soon as any part of it crosses the trigger line,
         * whatever its height.
         */
        threshold: 0,
        // Trigger a little before the element reaches the bottom edge, so the fade has started
        // by the time it is properly in view.
        rootMargin: '0px 0px -10% 0px',
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag id={id} ref={ref} className={cn('ns-reveal', className)}>
      {children}
    </Tag>
  );
}
