'use client';

import { useEffect, useRef, useState } from 'react';
import { BrandedImage } from '@/components/common/BrandedImage';
import { cn } from '@/lib/utils';

/**
 * Hero motion — BUILD_BRIEF §4, §5.5 item 21, §12.4.
 *
 * Damped CSS parallax, no 3D and no WebGL: pointer position is normalised to −1..1, eased toward
 * with a lerp of 0.045 per frame in one requestAnimationFrame loop, and applied as
 * translate3d(-cx*16px, -cy*11px, 0) scale(1.05) — the design's numbers, unchanged.
 *
 * Three gates the design did not have:
 *   • `pointer:fine` and `prefers-reduced-motion` are checked before the loop ever starts, so
 *     touch devices never run it (§12.4: no parallax on touch devices);
 *   • an IntersectionObserver cancels the frame loop once the hero scrolls out of view, so a
 *     mid-range Android phone is not animating an off-screen element while reading the tariff;
 *   • listeners and the pending frame are torn down on unmount.
 *
 * When the loop is gated off, Ken Burns drift takes over as the fallback (§4).
 */
export function HeroParallax({ alt }: { alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer:fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduced.matches) return;

    const el = frameRef.current;
    if (!el) return;

    setInteractive(true);

    // target (tx,ty) chases the pointer; current (cx,cy) eases toward it.
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let running = false;

    const onMove = (event: PointerEvent) => {
      tx = (event.clientX / window.innerWidth - 0.5) * 2;
      ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const tick = () => {
      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;
      el.style.transform = `translate3d(${(-cx * 16).toFixed(2)}px, ${(-cy * 11).toFixed(2)}px, 0) scale(1.05)`;
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      window.addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.01 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      stop();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={frameRef}
        className={cn(
          'absolute -inset-[5%] scale-[1.04] will-change-transform',
          // Ken Burns is the touch / reduced-motion fallback; it stops once parallax takes over.
          !interactive && 'animate-[var(--animate-ns-ken)]',
        )}
      >
        <BrandedImage
          id="ns-hero-studio"
          alt={alt}
          width={1200}
          height={1500}
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="h-full w-full object-cover"
          frameClassName="h-full w-full"
        />
      </div>

      {/* Warm vignette, so the neon sign reads against the photograph. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(190deg,rgba(46,42,40,.28)_0%,transparent_38%,rgba(46,42,40,.34)_100%)]"
      />

      {/* Five rising gold particles — positions, durations and delays as designed. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[
          { left: '22%', bottom: '6%', duration: '13s', delay: '0s' },
          { left: '41%', bottom: '2%', duration: '17s', delay: '2.5s' },
          { left: '58%', bottom: '8%', duration: '15s', delay: '5s' },
          { left: '72%', bottom: '0%', duration: '19s', delay: '7.5s' },
          { left: '88%', bottom: '10%', duration: '16s', delay: '10s' },
        ].map((p) => (
          <span
            key={p.left}
            className="absolute size-[5px] rounded-full bg-champagne-lt shadow-[0_0_12px_3px_rgba(212,184,150,.7)]"
            style={{
              left: p.left,
              bottom: p.bottom,
              animation: `nsFloat ${p.duration} linear ${p.delay} infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
