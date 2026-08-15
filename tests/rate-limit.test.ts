import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOOKING_LIMITS,
  MemoryRateLimitStore,
  checkBookingRateLimit,
} from '@/lib/rate-limit';

/** BUILD_BRIEF §5.3 item 11 — the design had no spam protection at all. */
describe('booking rate limit', () => {
  let store: MemoryRateLimitStore;
  const now = Date.UTC(2026, 7, 15, 10, 0, 0);

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  const attempt = (over: { ip?: string | null; phone?: string; now?: number } = {}) =>
    checkBookingRateLimit({
      ip: over.ip === undefined ? '41.100.0.1' : over.ip,
      phone: over.phone ?? '0553366712',
      now: over.now ?? now,
      store,
    });

  it('allows a normal booking', async () => {
    await expect(attempt()).resolves.toMatchObject({ allowed: true });
  });

  it('stops one phone booking over and over', async () => {
    // Vary the IP so the phone limit is unambiguously the one that trips.
    for (let i = 0; i < BOOKING_LIMITS.perPhone.limit; i++) {
      const result = await attempt({ ip: `41.100.0.${i + 10}` });
      expect(result.allowed).toBe(true);
    }

    const blocked = await attempt({ ip: '41.100.0.99' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe('phone');
    expect(blocked.resetAt).toBeInstanceOf(Date);
  });

  it('stops one address hammering the endpoint', async () => {
    for (let i = 0; i < BOOKING_LIMITS.perIp.limit; i++) {
      const result = await attempt({ phone: `055000${String(i).padStart(4, '0')}` });
      expect(result.allowed).toBe(true);
    }

    const blocked = await attempt({ phone: '0559999999' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe('ip');
  });

  it('keeps two different clients independent', async () => {
    for (let i = 0; i < BOOKING_LIMITS.perPhone.limit; i++) {
      await attempt({ ip: `41.100.1.${i}`, phone: '0551111111' });
    }
    await expect(attempt({ ip: '41.100.1.50', phone: '0551111111' })).resolves.toMatchObject({
      allowed: false,
    });
    // A different person, same moment, must still get through.
    await expect(attempt({ ip: '41.100.1.51', phone: '0552222222' })).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('lets the window slide', async () => {
    for (let i = 0; i < BOOKING_LIMITS.perPhone.limit; i++) {
      await attempt({ ip: `41.100.2.${i}` });
    }
    await expect(attempt({ ip: '41.100.2.90' })).resolves.toMatchObject({ allowed: false });

    const later = now + BOOKING_LIMITS.perPhone.windowMs + 1_000;
    await expect(attempt({ ip: '41.100.2.91', now: later })).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('still limits by phone when the address is unknown', async () => {
    // Behind some proxies there is no usable client IP; the phone limit must still apply.
    for (let i = 0; i < BOOKING_LIMITS.perPhone.limit; i++) {
      await attempt({ ip: null });
    }
    await expect(attempt({ ip: null })).resolves.toMatchObject({
      allowed: false,
      scope: 'phone',
    });
  });
});
