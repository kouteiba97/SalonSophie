import { describe, expect, it } from 'vitest';
import {
  bookingReducer,
  canAdvance,
  initialBookingState,
  type BookingState,
} from '@/components/booking/booking-reducer';
import { bookingDetailsSchema } from '@/components/booking/booking-schema';
import { dayState, monthGrid, weekStrip } from '@/lib/availability';
import { addDays, startOfDay, toIsoDate } from '@/lib/datetime';

const messages = {
  nameRequired: 'nameRequired',
  nameTooShort: 'nameTooShort',
  phoneRequired: 'phoneRequired',
  phoneInvalid: 'phoneInvalid',
};

describe('booking reducer', () => {
  it('will not advance past a step that is not satisfied', () => {
    const state = bookingReducer(initialBookingState, { type: 'open' });
    expect(canAdvance(state)).toBe(false);
    expect(bookingReducer(state, { type: 'next' }).step).toBe(0);
  });

  it('advances once a service is chosen', () => {
    let state = bookingReducer(initialBookingState, { type: 'open' });
    state = bookingReducer(state, { type: 'selectService', slug: 'coupe' });
    expect(canAdvance(state)).toBe(true);
    expect(bookingReducer(state, { type: 'next' }).step).toBe(1);
  });

  /**
   * §5.3 item 10 — the design mixed gowns into the service list and a click booked the rental.
   * Choosing a gown must produce a *fitting*, and must clear any service already chosen.
   */
  it('treats a gown as a fitting, never as a rental', () => {
    let state = bookingReducer(initialBookingState, { type: 'selectService', slug: 'coupe' });
    state = bookingReducer(state, { type: 'selectGown', slug: 'anastasia' });
    expect(state.kind).toBe('fitting');
    expect(state.gownSlug).toBe('anastasia');
    expect(state.serviceSlug).toBeNull();
  });

  it('clears the chosen time when the day changes', () => {
    let state: BookingState = { ...initialBookingState, date: '2026-09-01', time: '10:30' };
    state = bookingReducer(state, { type: 'selectDate', date: '2026-09-02' });
    expect(state.time).toBeNull();
  });

  it('never pages the week strip into the past', () => {
    const state = bookingReducer(initialBookingState, { type: 'shiftWeek', by: -1 });
    expect(state.weekOffset).toBe(0);
  });

  it('requires date AND time before leaving the date step', () => {
    const withDate: BookingState = { ...initialBookingState, step: 2, date: '2026-09-01' };
    expect(canAdvance(withDate)).toBe(false);
    expect(canAdvance({ ...withDate, time: '10:30' })).toBe(true);
  });
});

describe('booking validation (§12.6)', () => {
  const schema = bookingDetailsSchema(messages);

  it('accepts Algerian mobiles on 05, 06 and 07', () => {
    for (const phone of ['0553366712', '0661234567', '0771234567']) {
      expect(schema.safeParse({ name: 'Amel', phone }).success).toBe(true);
    }
  });

  it('tolerates the spaces and dashes clients actually type', () => {
    const result = schema.safeParse({ name: 'Amel', phone: '05 53 36 67 12' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('0553366712');
  });

  it('rejects what the design would have accepted', () => {
    // The design only checked the field was non-empty.
    for (const phone of ['abc', '123', '0453366712', '055336671', '05533667123', '+213553366712']) {
      expect(schema.safeParse({ name: 'Amel', phone }).success).toBe(false);
    }
  });

  it('rejects an empty or one-character name', () => {
    expect(schema.safeParse({ name: '', phone: '0553366712' }).success).toBe(false);
    expect(schema.safeParse({ name: 'A', phone: '0553366712' }).success).toBe(false);
  });
});

describe('availability (§5.3)', () => {
  const today = startOfDay(new Date('2026-08-15T09:00:00'));

  it('renders 42 cells, as the design’s month grid did', () => {
    expect(monthGrid(0, today)).toHaveLength(42);
  });

  it('renders 7 days in the strip', () => {
    expect(weekStrip(0, today)).toHaveLength(7);
  });

  it('disables the past', () => {
    const yesterday = dayState(addDays(today, -1), { today });
    expect(yesterday.disabled).toBe(true);
    expect(yesterday.reason).toBe('past');
  });

  it('enforces a minimum lead time', () => {
    expect(dayState(today, { today }).reason).toBe('tooSoon');
  });

  it('enforces a maximum advance window', () => {
    expect(dayState(addDays(today, 400), { today }).reason).toBe('tooFar');
  });

  it('always states a reason, so state is never colour-only (§5.4 item 16)', () => {
    for (const day of monthGrid(0, today)) {
      if (day.disabled && !day.outsideMonth) expect(day.reason).not.toBeNull();
    }
  });

  /**
   * The design closed Fridays with `d.getDay()===5` and faked fullness with a string hash.
   * Opening hours are unknown (§6), so no weekday may be hardcoded closed, and no day may be
   * marked full without real data behind it.
   */
  it('hardcodes no weekly closing day and fakes no fullness', () => {
    const bookable = monthGrid(1, today).filter((d) => !d.outsideMonth && !d.disabled);
    const weekdays = new Set(bookable.map((d) => d.date.getDay()));
    expect(weekdays.has(5)).toBe(true); // Friday is not assumed closed
    expect(bookable.every((d) => d.reason === null)).toBe(true);
    expect(monthGrid(1, today).some((d) => d.reason === 'full')).toBe(false);
  });

  it('produces stable ISO dates with no timezone drift', () => {
    expect(toIsoDate(new Date(2026, 7, 15))).toBe('2026-08-15');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
