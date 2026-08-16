import type { IsoDate } from '@/lib/datetime';
import type { ConsoleAppointment, OpeningWindow } from './day-line';
import type { Deal } from './deal-types';
import type { InboxConversation, InboxMessage } from './inbox';
import type { ClientDetail, ConsoleClient } from './clients';
// Type-only, so this stays a plain module: both are `server-only` and import back from here.
import type { AccessoryStock, ProductStock } from './stock';
import type {
  CashFlowDay,
  DataGap,
  ExpenseGroup,
  LineRevenue,
  ServiceRevenue,
} from './finances';
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

/* ── the shelf ────────────────────────────────────────────────────────────────────────────── */

/**
 * Products a salon actually consumes, with a stock level worth reading.
 *
 * These are example records in the §14 sense, and the distinction from §6 holds exactly as it
 * does for the demo diary: nobody outside the console ever sees them, and no client is quoted a
 * price from this list. What they are *not* allowed to do is invent the shape of the problem —
 * so one product sits below its threshold, one has no threshold at all, and one has no unit cost,
 * because those are the three states the screen has to render honestly.
 */
export function demoProductStock(): ProductStock[] {
  return [
    {
      productId: 'demo-p1',
      slug: 'coloration-7-3',
      name: 'Coloration 7.3',
      brand: 'Majirel',
      line: 'salon',
      unit: 'piece',
      unitCost: 95_000,
      reorderLevel: 6,
      onHand: 3,
      needsReorder: true,
      lastMovementOn: '2026-08-14',
    },
    {
      productId: 'demo-p2',
      slug: 'oxydant-20-vol',
      name: 'Oxydant 20 vol',
      brand: null,
      line: 'salon',
      unit: 'l',
      unitCost: 42_000,
      reorderLevel: 2,
      onHand: 5.5,
      needsReorder: false,
      lastMovementOn: '2026-08-12',
    },
    {
      productId: 'demo-p3',
      slug: 'shampoing-post-couleur',
      name: 'Shampoing post-couleur',
      brand: 'Kérastase',
      line: 'salon',
      unit: 'ml',
      unitCost: 210_000,
      reorderLevel: 1000,
      onHand: 800,
      needsReorder: true,
      lastMovementOn: '2026-08-09',
    },
    {
      // No threshold set: the screen must say so rather than call it "fine".
      productId: 'demo-p4',
      slug: 'cire-epilation',
      name: 'Cire à épiler',
      brand: null,
      line: 'salon',
      unit: 'kg',
      unitCost: 68_000,
      reorderLevel: null,
      onHand: 4,
      needsReorder: false,
      lastMovementOn: '2026-07-30',
    },
    {
      // No unit cost: an em dash, never a zero, which would report 100% margin.
      productId: 'demo-p5',
      slug: 'colle-cils',
      name: 'Colle à cils',
      brand: null,
      line: 'makeup',
      unit: 'piece',
      unitCost: null,
      reorderLevel: 3,
      onHand: 2,
      needsReorder: true,
      lastMovementOn: '2026-08-05',
    },
    {
      productId: 'demo-p6',
      slug: 'housse-robe',
      name: 'Housse de robe',
      brand: null,
      line: 'bridal',
      unit: 'piece',
      unitCost: 30_000,
      reorderLevel: 5,
      onHand: 12,
      needsReorder: false,
      lastMovementOn: '2026-08-01',
    },
  ];
}

/**
 * The three real accessories (§6), two of them never counted.
 *
 * `stockTotal: 0` is the seeded default and means "nobody has counted these", which is why the
 * panel renders it as unknown rather than as an empty shelf. Only the veil carries a real count
 * here, so both renderings can be judged side by side.
 */
export function demoAccessoryStock(): AccessoryStock[] {
  return [
    { id: 'demo-acc1', slug: 'barnous', name: 'Barnous', stockTotal: 0, rentalPrice: null, outOnLoan: 1 },
    { id: 'demo-acc2', slug: 'diademe', name: 'Diadème', stockTotal: 0, rentalPrice: null, outOnLoan: 0 },
    { id: 'demo-acc3', slug: 'voile', name: 'Voile', stockTotal: 4, rentalPrice: null, outOnLoan: 2 },
  ];
}

/* ── the money ────────────────────────────────────────────────────────────────────────────── */

/**
 * A period's takings, invented in the §14 sense and in no other.
 *
 * Everything below is derived from the two tables that follow, rather than written out panel by
 * panel — because the panels have to **agree**. A first pass hand-wrote each one, and the screen
 * showed 84 320 DA earned by line above 24 680 DA of cash flow: three correct-looking panels
 * contradicting each other, which is worse than no demo data at all. Nobody can judge a layout
 * while doing arithmetic to work out whether it is lying.
 *
 * The shape is the point, not the amounts: three businesses earning through different tables, one
 * of them quiet, and spending that is lumpy rather than smooth. Nobody outside the console sees
 * any of it and no client is ever quoted from it.
 */

/** Takings by weekday, Sunday first. Friday is quiet in the demo week — real hours are §6. */
const DEMO_TAKINGS = [920_000, 610_000, 740_000, 550_000, 1_180_000, 0, 1_430_000];

/** Spending is lumpy: rent lands on the 1st, a delivery on the 3rd. */
const DEMO_SPENDING = [
  // Rent belongs to the address, not to hair — which is what a null line means.
  { dayOfMonth: 1, category: 'rent', line: 'shared', amount: 3_500_000 },
  { dayOfMonth: 3, category: 'stock', line: 'salon', amount: 940_000 },
  { dayOfMonth: 8, category: 'utilities', line: 'shared', amount: 310_000 },
  { dayOfMonth: 12, category: 'marketing', line: 'creator', amount: 180_000 },
] as const;

/** How the takings split. Makeup earns nothing, so the ranking has to supply the zero. */
const DEMO_LINE_SHARES = [
  { line: 'salon', share: 0.62, averageTicket: 150_000 },
  { line: 'bridal', share: 0.26, averageTicket: 2_500_000 },
  { line: 'creator', share: 0.12, averageTicket: 7_500_000 },
] as const;

/** Shares of the salon's own takings. Booked most and earning most are deliberately different. */
const DEMO_SERVICE_SHARES = [
  {
    slug: 'coupe-brushing-longs',
    name: 'Coupe + brushing longs',
    category: 'Coiffure',
    share: 0.44,
    perBooking: 150_000,
  },
  {
    slug: 'coupe',
    name: 'Coupe',
    category: 'Coiffure',
    share: 0.23,
    perBooking: 70_000,
  },
  {
    slug: 'soins-capillaires',
    name: 'Soins capillaires',
    category: 'Coiffure',
    share: 0.19,
    perBooking: 200_000,
  },
  {
    // The reporting migration's own example: most booked, least profitable.
    slug: 'epilation-levre',
    name: 'Épilation lèvre',
    category: 'Épilation',
    share: 0.14,
    perBooking: 20_000,
  },
] as const;

interface DemoPeriod {
  from: string;
  to: string;
}

/** Every day in the period, so a preset and a custom range both draw a full chart. */
function eachDay(period: DemoPeriod): Date[] {
  const days: Date[] = [];
  const end = new Date(`${period.to}T12:00:00Z`);

  // Bounded, so a mistyped range in the URL cannot spin here.
  for (
    let day = new Date(`${period.from}T12:00:00Z`), n = 0;
    day <= end && n < 400;
    day.setUTCDate(day.getUTCDate() + 1), n++
  ) {
    days.push(new Date(day));
  }

  return days;
}

export function demoCashFlow(period: DemoPeriod): CashFlowDay[] {
  return eachDay(period).map((day) => ({
    onDate: day.toISOString().slice(0, 10),
    revenue: DEMO_TAKINGS[day.getUTCDay()] ?? 0,
    spend: DEMO_SPENDING.filter((item) => item.dayOfMonth === day.getUTCDate()).reduce(
      (total, item) => total + item.amount,
      0,
    ),
  }));
}

/** The period's total takings — the figure every revenue panel is a slice of. */
function demoRevenue(period: DemoPeriod): number {
  return demoCashFlow(period).reduce((total, day) => total + day.revenue, 0);
}

export function demoRevenueByLine(period: DemoPeriod): LineRevenue[] {
  const total = demoRevenue(period);

  return DEMO_LINE_SHARES.map(({ line, share, averageTicket }) => {
    const revenue = Math.round(total * share);
    return {
      line,
      revenue,
      // At least one transaction whenever any money came in — a line cannot earn from nothing.
      transactions: revenue > 0 ? Math.max(1, Math.round(revenue / averageTicket)) : 0,
    };
  });
}

export function demoServicePerformance(period: DemoPeriod): ServiceRevenue[] {
  const salon = DEMO_LINE_SHARES.find((line) => line.line === 'salon');
  const salonRevenue = Math.round(demoRevenue(period) * (salon?.share ?? 0));

  return DEMO_SERVICE_SHARES.map(({ slug, name, category, share, perBooking }) => {
    const revenue = Math.round(salonRevenue * share);
    return {
      serviceSlug: slug,
      serviceName: name,
      categoryName: category,
      bookings: revenue > 0 ? Math.max(1, Math.round(revenue / perBooking)) : 0,
      revenue,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

/** The same spending the cash-flow chart shows, grouped the way `expense_summary` groups it. */
export function demoExpenseSummary(period: DemoPeriod): ExpenseGroup[] {
  const occurrences = new Map<string, ExpenseGroup>();

  for (const day of eachDay(period)) {
    for (const item of DEMO_SPENDING) {
      if (item.dayOfMonth !== day.getUTCDate()) continue;

      const key = `${item.category}-${item.line}`;
      const existing = occurrences.get(key);
      if (existing) {
        existing.total += item.amount;
        existing.entries += 1;
      } else {
        occurrences.set(key, {
          category: item.category,
          line: item.line,
          total: item.amount,
          entries: 1,
        });
      }
    }
  }

  return [...occurrences.values()].sort((a, b) => b.total - a.total);
}

/** The unknowns, as a number that goes down when Nour and Sophie answer §6. */
export function demoDataGaps(): DataGap[] {
  return [
    { gap: 'service_duration', missing: 41 },
    { gap: 'opening_hours', missing: 1 },
    { gap: 'gown_rental_price', missing: 3 },
    { gap: 'product_cost', missing: 1 },
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
