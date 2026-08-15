import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ConsoleSidebar } from '@/components/staff/ConsoleSidebar';
import type { Locale } from '@/i18n/routing';
import { getStaffSession } from '@/lib/auth';

/**
 * Everything below here is signed in — but not necessarily front desk.
 *
 * A stylist belongs in the console: §7 gives them their own day and their own clients, and RLS
 * already limits `appointments_read` to exactly that. The atelier is the screen they cannot use,
 * so the front-desk check lives there rather than here — putting it at this level would have
 * locked a stylist out of their own calendar to protect the gown rail.
 */
export default async function ConsoleLayout({
  children,
  params,
}: {
  children: ReactNode;
  // Next's generated layout types widen the segment to `string`; the locale was already
  // validated by the layout above this one.
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  setRequestLocale(typedLocale);

  const session = await getStaffSession();
  if (!session) redirect(`/${typedLocale}/connexion`);

  return (
    <div className="lg:flex lg:items-start">
      <ConsoleSidebar fullName={session.fullName} role={session.role} locale={typedLocale} />
      <div className="mx-auto w-full max-w-[1180px] px-6 py-8 lg:flex-1">{children}</div>
    </div>
  );
}
