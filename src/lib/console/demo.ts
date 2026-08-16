import type { IsoDate } from '@/lib/datetime';
import type { ConsoleAppointment, OpeningWindow } from './day-line';
import type { Deal } from './deal-types';
import type { InboxConversation, InboxMessage } from './inbox';
import type { ClientDetail, ConsoleClient } from './clients';
import type { StaffSession } from '@/lib/auth';

/**
 * Example records, so the console can actually be looked at.
 *
 * BUILD_BRIEF §14 asks for this in as many words — "seed realistically, an empty app cannot be
 * evaluated" — and it does not contradict §6. The two are about different things:
 *
 *   §6 forbids inventing **business facts**: what a balayage costs, when the salon opens, who
 *   works there, what a client said about them. Those reach a real client as claims, and a wrong
 *   one is not recoverable.
 *
 *   §14 asks for **example records**: a Tuesday with four appointments in it, a bride with a
 *   dress on hold, an unanswered message. Nobody mistakes those for the salon's actual diary,
 *   and without them the day-line is an empty grid nobody can judge.
 *
 * Two guards keep the distinction from eroding:
 *
 *   1. Demo data appears **only when no database is configured**. The moment a Supabase project
 *      exists, real data wins unconditionally — there is no flag that can override it.
 *   2. The console renders a banner saying the data is fictional, on every screen.
 *
 * The public site never touches any of this. A client seeing an invented price is the failure
 * this whole codebase is arranged to prevent; a member of staff seeing an obviously-labelled
 * example day is how they decide whether the screen works.
 */

/**
 * Demo mode is opt-in, and impossible once a real database exists.
 *
 * The environment is read here rather than imported from `supabase/session`, which is
 * `server-only` — this module has to stay importable by a plain unit test, because the guarantee
 * below is the one worth testing.
 */
export function isDemoMode(): boolean {
  const databaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return process.env.NEXT_PUBLIC_DEMO_DATA === '1' && !databaseConfigured;
}

/**
 * Whether the console has anything to show at all.
 *
 * Screens ask this rather than `isAuthConfigured`, because "no database" and "nothing to render"
 * stopped being the same question once demo mode existed. Getting it wrong is not dangerous —
 * it shows the honest "not connected" notice over data that is right there — but it does make
 * the console look broken when it is not.
 */
export function hasConsoleData(): boolean {
  const databaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return databaseConfigured || isDemoMode();
}

/**
 * A signed-in owner, without an auth server.
 *
 * Safe precisely because demo mode requires the absence of a database: there is no real client
 * data for this session to reach, because there is no data at all. With Supabase configured,
 * `isDemoMode()` is false and this is never constructed.
 */
export const DEMO_SESSION: StaffSession = {
  userId: 'demo-owner',
  email: null,
  fullName: 'Sophie (démo)',
  role: 'owner',
  tenantId: 'demo-tenant',
  staffId: 'demo-staff',
  staffSlug: 'sophie',
};

const at = (hour: number, minute = 0) => hour * 60 + minute;

/*
 * Names are ordinary Algerian first names with an initial, never a full plausible identity —
 * these are illustrations, not people, and they should not read like a leaked client list.
 */
const PEOPLE = [
  { id: 'demo-c1', name: 'Amel B.', phone: '0551000001', bride: false },
  { id: 'demo-c2', name: 'Lina K.', phone: '0551000002', bride: true },
  { id: 'demo-c3', name: 'Sara M.', phone: '0551000003', bride: false },
  { id: 'demo-c4', name: 'Nadia C.', phone: '0551000004', bride: false },
  { id: 'demo-c5', name: 'Rym H.', phone: '0551000005', bride: true },
] as const;

/**
 * Opening hours for the demo day.
 *
 * These are *example* hours, not the salon's. The real ones are unknown (§6, question 1) and the
 * day-line derives its axis when the table is empty — which is the behaviour that ships. Demo
 * mode supplies them so the timeline has a stable shape to be judged on.
 */
export function demoOpeningWindows(): OpeningWindow[] {
  return [{ opensAt: at(9), closesAt: at(19) }];
}

/** A plausible working day: two lanes busy, one quiet, and two requests waiting to be confirmed. */
export function demoAppointments(day: IsoDate): ConsoleAppointment[] {
  const make = (
    n: number,
    line: ConsoleAppointment['line'],
    startMinute: number,
    endMinute: number | null,
    person: (typeof PEOPLE)[number],
    serviceName: string | null,
    priceCharged: number | null,
    extra: Partial<ConsoleAppointment> = {},
  ): ConsoleAppointment => ({
    id: `demo-a${n}-${day}`,
    reference: `DEMO${String(n).padStart(4, '0')}`,
    line,
    status: 'confirmed',
    startMinute,
    endMinute,
    clientName: person.name,
    clientPhone: person.phone,
    staffName: n % 2 === 0 ? 'Sophie' : 'Nour',
    serviceName,
    gownName: null,
    priceCharged,
    notes: null,
    ...extra,
  });

  return [
    make(1, 'salon', at(9, 30), at(10, 30), PEOPLE[0], 'Coupe + brushing longs', 150_000),
    // Same hour as the one above, different stylist — this is what makes the lane stack.
    make(2, 'salon', at(10), at(11), PEOPLE[2], 'Brushing mi-longs', 120_000),
    // A range on the real tariff, so the price is settled at the chair, not now.
    make(3, 'salon', at(11, 30), at(13), PEOPLE[3], 'Soins capillaires', null),
    make(4, 'salon', at(15), at(16), PEOPLE[0], 'Coupe', 70_000, { status: 'pending' }),
    make(5, 'bridal', at(14), at(15, 30), PEOPLE[1], 'Essayage', null, {
      gownName: 'Anastasia',
      notes: 'Retouche bustier à prévoir.',
    }),
    make(6, 'makeup', at(16, 30), at(17, 30), PEOPLE[4], 'Maquillage mariée', null),
    // Requests: no end time, because no duration is known. They hold no slot.
    make(7, 'salon', at(12), null, PEOPLE[4], 'Balayage', null, { status: 'pending' }),
    make(8, 'bridal', at(17), null, PEOPLE[1], 'Essayage', null, { status: 'pending' }),
  ];
}

export function demoClients(): ConsoleClient[] {
  return PEOPLE.map((person, index) => ({
    id: person.id,
    fullName: person.name,
    phone: person.phone,
    isBride: person.bride,
    visitCount: [7, 2, 4, 1, 3][index],
    lifetimeSpend: [980_000, 240_000, 610_000, 70_000, 450_000][index],
    lastVisit: null,
  }));
}

export function demoClient(id: string): ClientDetail | null {
  const base = demoClients().find((client) => client.id === id);
  if (!base) return null;

  return {
    ...base,
    notes:
      base.id === 'demo-c1'
        ? [
            {
              id: 'demo-n1',
              // The kind of thing §13 wants recorded: unrepeatable if nobody wrote it down.
              body: 'Coloration : 7.3 + 8.1, 20 vol, 35 min. Sensible au niveau des tempes.',
              authorName: 'Nour',
              createdAt: '2026-06-12T10:00:00Z',
            },
          ]
        : [],
    history: [
      {
        id: 'demo-h1',
        reference: 'DEMO0001',
        line: 'salon',
        status: 'completed',
        at: '2026-07-04T09:30:00Z',
        isRequest: false,
        serviceName: 'Coupe + brushing longs',
        staffName: 'Nour',
      },
      {
        id: 'demo-h2',
        reference: 'DEMO0002',
        line: 'salon',
        status: 'completed',
        at: '2026-05-18T14:00:00Z',
        isRequest: false,
        serviceName: 'Soins capillaires',
        staffName: 'Sophie',
      },
    ],
    reservations: base.isBride
      ? [
          {
            id: 'demo-r1',
            reference: 'DEMO7001',
            gownName: 'Anastasia',
            period: '[2027-06-11,2027-06-15)',
            status: 'confirmed',
          },
        ]
      : [],
  };
}

export function demoConversations(): InboxConversation[] {
  return [
    {
      id: 'demo-conv1',
      channel: 'whatsapp',
      subject: null,
      isAnswered: false,
      lastMessageAt: '2026-08-16T08:12:00Z',
      client: { id: 'demo-c2', fullName: 'Lina K.', phone: '0551000002' },
      preview: 'Bonjour, est-ce que la robe Anastasia est libre le 12 juin ?',
    },
    {
      id: 'demo-conv2',
      channel: 'instagram',
      subject: null,
      isAnswered: false,
      lastMessageAt: '2026-08-16T07:40:00Z',
      client: { id: 'demo-c5', fullName: 'Rym H.', phone: '0551000005' },
      preview: 'Vous faites le maquillage mariée aussi ?',
    },
    {
      id: 'demo-conv3',
      channel: 'phone',
      subject: null,
      isAnswered: true,
      lastMessageAt: '2026-08-15T16:05:00Z',
      client: { id: 'demo-c3', fullName: 'Sara M.', phone: '0551000003' },
      preview: 'Parfait, je confirme pour samedi. Merci !',
    },
  ];
}

export function demoConversation(
  id: string,
): { conversation: InboxConversation; messages: InboxMessage[] } | null {
  const conversation = demoConversations().find((c) => c.id === id);
  if (!conversation) return null;

  const messages: InboxMessage[] =
    id === 'demo-conv3'
      ? [
          {
            id: 'demo-m1',
            direction: 'inbound',
            body: 'Bonjour, vous avez une place samedi matin ?',
            sentAt: '2026-08-15T15:50:00Z',
          },
          {
            id: 'demo-m2',
            direction: 'outbound',
            body: 'Bonjour ! Oui, samedi à 10 h. Je vous note ?',
            sentAt: '2026-08-15T16:00:00Z',
          },
          {
            id: 'demo-m3',
            direction: 'inbound',
            body: 'Parfait, je confirme pour samedi. Merci !',
            sentAt: '2026-08-15T16:05:00Z',
          },
        ]
      : [
          {
            id: 'demo-m4',
            direction: 'inbound',
            body: conversation.preview ?? '',
            sentAt: conversation.lastMessageAt ?? '2026-08-16T08:00:00Z',
          },
        ];

  return { conversation, messages };
}

export function demoDeals(): Deal[] {
  return [
    {
      id: 'demo-d1',
      brandName: 'Maison Loubna',
      stage: 'pitched',
      // Not agreed yet — the card shows "montant non fixé", never 0 DA.
      valueAmount: null,
      contactName: 'Loubna',
      contactHandle: '@maisonloubna',
      nextAction: 'Relancer après la story',
      nextActionDue: '2026-08-24',
      nextDeliverable: null,
      deliverableCount: 0,
      deliveredCount: 0,
    },
    {
      id: 'demo-d2',
      brandName: 'Dziri Cosmetics',
      stage: 'negotiating',
      valueAmount: 8_000_000,
      contactName: 'Yacine',
      contactHandle: '@dziricosmetics',
      nextAction: 'Envoyer le tarif révisé',
      nextActionDue: '2026-08-20',
      nextDeliverable: null,
      deliverableCount: 0,
      deliveredCount: 0,
    },
    {
      id: 'demo-d3',
      brandName: 'Atelier Rym',
      stage: 'contracted',
      valueAmount: 15_000_000,
      contactName: null,
      contactHandle: '@atelierrym',
      nextAction: null,
      nextActionDue: null,
      nextDeliverable: { description: 'Reel essayage — 30 s', dueOn: '2026-09-02' },
      deliverableCount: 3,
      deliveredCount: 1,
    },
    {
      id: 'demo-d4',
      brandName: 'Nour Skincare',
      stage: 'delivered',
      valueAmount: 6_500_000,
      contactName: null,
      contactHandle: null,
      nextAction: null,
      nextActionDue: null,
      nextDeliverable: null,
      deliverableCount: 2,
      deliveredCount: 2,
    },
  ];
}

/** Gowns physically out on the demo day, for the KPI card. */
export const DEMO_GOWNS_OUT = 1;

export function demoUnansweredCount(): number {
  return demoConversations().filter((c) => !c.isAnswered).length;
}

/* ── the atelier ──────────────────────────────────────────────────────────────────────────── */

/**
 * Reservations against the three real gowns, so the atelier has a timeline worth reading.
 *
 * The gowns themselves are not invented — Anastasia, ABir and RYMA are the salon's actual
 * inventory (§6 confirms them). What is invented is who has booked them, which is the part §14
 * asks for and no client ever sees.
 */
export function demoReservations(): {
  id: string;
  reference: string;
  gownSlug: string;
  gownName: string;
  range: { start: string; end: string };
  cleaningBufferDays: number;
  status: 'held' | 'confirmed' | 'returned' | 'cancelled';
  depositAmount: number | null;
  notes: string | null;
  client: { id: string; fullName: string; phone: string };
  createdAt: string;
}[] {
  return [
    {
      id: 'demo-res1',
      reference: 'DEMO7001',
      gownSlug: 'anastasia',
      gownName: 'Anastasia',
      // Two cleaning days sit inside the range, which is why it ends on the 17th, not the 15th.
      range: { start: '2027-06-11', end: '2027-06-17' },
      cleaningBufferDays: 2,
      status: 'confirmed',
      // A deposit nobody has set a policy for stays null on the other two, deliberately.
      depositAmount: 2_000_000,
      notes: 'Retouche bustier prévue le 5 juin.',
      client: { id: 'demo-c2', fullName: 'Lina K.', phone: '0551000002' },
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'demo-res2',
      reference: 'DEMO7002',
      gownSlug: 'ryma',
      gownName: 'RYMA',
      range: { start: '2027-07-02', end: '2027-07-06' },
      cleaningBufferDays: 0,
      status: 'held',
      depositAmount: null,
      notes: null,
      client: { id: 'demo-c5', fullName: 'Rym H.', phone: '0551000005' },
      createdAt: '2026-08-10T10:00:00Z',
    },
    {
      id: 'demo-res3',
      reference: 'DEMO7003',
      gownSlug: 'abir',
      gownName: 'ABir',
      range: { start: '2026-08-14', end: '2026-08-19' },
      cleaningBufferDays: 1,
      status: 'confirmed',
      depositAmount: null,
      notes: null,
      client: { id: 'demo-c1', fullName: 'Amel B.', phone: '0551000001' },
      createdAt: '2026-07-20T10:00:00Z',
    },
  ];
}

/** One dress out, one on hold, one on the rail — every state the board can show. */
export function demoUtilisation(): {
  gownId: string;
  slug: string;
  name: string;
  state: 'available' | 'rented' | 'cleaning' | 'repair';
  daysReserved: number;
  reservationCount: number;
}[] {
  return [
    { gownId: 'demo-g1', slug: 'anastasia', name: 'Anastasia', state: 'available', daysReserved: 0, reservationCount: 0 },
    { gownId: 'demo-g2', slug: 'abir', name: 'ABir', state: 'rented', daysReserved: 5, reservationCount: 1 },
    { gownId: 'demo-g3', slug: 'ryma', name: 'RYMA', state: 'cleaning', daysReserved: 0, reservationCount: 0 },
  ];
}
