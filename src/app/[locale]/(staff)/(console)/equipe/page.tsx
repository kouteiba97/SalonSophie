import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { NewStaffForm } from '@/components/staff/NewStaffForm';
import { StaffActions } from '@/components/staff/StaffActions';
import type { Locale } from '@/i18n/routing';
import { getStaffSession } from '@/lib/auth';
import { hasConsoleData } from '@/lib/console/demo';
import { getBookablePeople, getTeam, type TeamMember } from '@/lib/console/team';

/**
 * The team — who may sign in, and what they may do.
 *
 * This is the screen that replaced "go and create a user in the Supabase dashboard". Two roles
 * matter here: an **admin** runs the business and sees the money; everyone else runs the day.
 * The description under each role says so in words, because picking the wrong one from a dropdown
 * of three nouns is the easiest mistake on this page to make and the hardest to notice.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.team' });
  return { title: t('title') };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.team' });
  const session = await getStaffSession();
  const [team, people] = await Promise.all([getTeam(), getBookablePeople()]);

  const pending = team.filter((member) => member.mustChangePassword && member.isActive).length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="max-w-[70ch] text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>

        {!hasConsoleData() ? (
          <p
            role="status"
            className="mt-2 rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('notConfigured')}
          </p>
        ) : null}
      </header>

      {/*
        An account still on its temporary password is a password somebody said out loud and nobody
        has replaced. Worth a line at the top rather than a badge halfway down a table.
      */}
      {pending > 0 ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('pendingPasswords', { count: pending })}
        </p>
      ) : null}

      <NewStaffForm people={people} />

      {team.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {team.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              isSelf={member.userId === session?.userId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: TeamMember; isSelf: boolean }) {
  const t = useTranslations('console.team');

  return (
    <li
      className={`flex flex-col gap-3 rounded-[20px] border bg-white px-5 py-4 ${
        member.isActive ? 'border-line' : 'border-line/60 opacity-70'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[19px] font-light text-charcoal">
              {member.fullName}
            </span>
            {isSelf ? (
              <span className="rounded-full bg-tint px-2.5 py-0.5 text-[11px] text-rose-deep">
                {t('you')}
              </span>
            ) : null}
            {!member.isActive ? (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-taupe">
                {t('inactive')}
              </span>
            ) : null}
          </span>

          <span dir="ltr" className="text-[12px] text-taupe">
            {member.email ?? '—'}
          </span>

          <span className="text-[12px] text-ink-2">
            {t(`roles.${member.role}`)}
            {member.staffName ? ` · ${t('linkedTo', { name: member.staffName })}` : ''}
          </span>

          {member.mustChangePassword && member.isActive ? (
            <span className="text-[12px] text-rose-dark">{t('awaitingPassword')}</span>
          ) : null}
        </div>
      </div>

      <StaffActions userId={member.userId} isActive={member.isActive} isSelf={isSelf} />
    </li>
  );
}
