'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * shadcn/ui Dialog over Radix (BUILD_BRIEF §5.4 item 12).
 *
 * The design's booking modal was a plain div: no focus trap, no Escape handler, no `aria-modal`,
 * no scroll lock, and focus was never restored to whatever opened it. Radix provides all five,
 * correctly, and keeps them correct — which is the entire argument for using the primitive
 * rather than hand-rolling a modal.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-[90] bg-charcoal/45 backdrop-blur-[3px]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        // Radix marks the rest of the page aria-hidden rather than setting aria-modal. That is
        // the more robust behaviour, but §5.4 item 12 asks for aria-modal by name and the two
        // do not conflict, so it is set explicitly.
        aria-modal="true"
        className={cn(
          'fixed inset-x-0 bottom-0 z-[95] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[26px] bg-cream-warm',
          'sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-32px))]',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[26px] rtl:sm:translate-x-1/2',
          'shadow-[0_30px_80px_-30px_rgba(46,42,40,.7)]',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
