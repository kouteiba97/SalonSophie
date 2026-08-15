'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BrandedImage } from './BrandedImage';

const MIN = 3;
const MAX = 97;
const STEP = 2;

/**
 * Before/after comparison — BUILD_BRIEF §5.4 item 14.
 *
 * The design's slider was pointer-only: three `pointerdown/move/up` listeners on a div, no
 * keyboard path, no role, no focus ring. Someone navigating by keyboard could not move it at all.
 *
 * This one is a real `role="slider"` with `aria-valuenow`, arrow keys stepping ±2 %, Home/End
 * jumping to either end, and a visible focus ring. Pointer dragging still works exactly as
 * designed, including click-to-position on the track.
 */
export function BeforeAfterSlider() {
  const t = useTranslations('transformations');
  const [value, setValue] = useState(52);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));

  const setFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    // Reading right-to-left, "before" starts on the right — mirror so the drag matches the eye.
    const isRtl = getComputedStyle(box).direction === 'rtl';
    const ratio = (clientX - rect.left) / rect.width;
    setValue(clamp((isRtl ? 1 - ratio : ratio) * 100));
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientX(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFromClientX(event.clientX);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number | 'min' | 'max'> = {
      ArrowLeft: -STEP,
      ArrowRight: STEP,
      ArrowDown: -STEP,
      ArrowUp: STEP,
      PageDown: -STEP * 5,
      PageUp: STEP * 5,
      Home: 'min',
      End: 'max',
    };
    const action = keys[event.key];
    if (action === undefined) return;
    event.preventDefault();
    if (action === 'min') return setValue(MIN);
    if (action === 'max') return setValue(MAX);
    setValue((current) => clamp(current + action));
  };

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative touch-none overflow-hidden rounded-[24px] select-none"
    >
      <BrandedImage
        id="ns-before-1"
        alt={t('before')}
        width={1000}
        height={700}
        sizes="(max-width: 1024px) 100vw, 640px"
        frameClassName="w-full"
      />

      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
        aria-hidden
      >
        <BrandedImage
          id="ns-after-1"
          alt={t('after')}
          width={1000}
          height={700}
          sizes="(max-width: 1024px) 100vw, 640px"
          frameClassName="w-full h-full"
          className="h-full"
        />
      </div>

      <span className="pointer-events-none absolute bottom-3 start-3 rounded-full bg-charcoal/70 px-3 py-1 text-[10px] uppercase tracking-[.2em] text-cream">
        {t('after')}
      </span>
      <span className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-charcoal/70 px-3 py-1 text-[10px] uppercase tracking-[.2em] text-cream">
        {t('before')}
      </span>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t('sliderLabel')}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(value)}
        aria-valuetext={t('sliderValue', { value: Math.round(value) })}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 z-10 grid w-11 -translate-x-1/2 cursor-ew-resize place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-deep rtl:translate-x-1/2"
        style={{ left: `${value}%` }}
      >
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-cream/90" />
        <span
          aria-hidden
          className="relative grid size-10 place-items-center rounded-full bg-cream text-rose-deep shadow-[0_6px_18px_-6px_rgba(46,42,40,.6)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
            <path d="M9 7l-4 5 4 5M15 7l4 5-4 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}
