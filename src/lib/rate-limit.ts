/**
 * Rate limiting for the public booking endpoint — BUILD_BRIEF §5.3 item 11.
 *
 * Limited by IP *and* by phone number, because they catch different things: one IP hammering the
 * endpoint is abuse, while the same phone booking six times in a minute is usually a client
 * double-tapping a slow button on Algerian 4G — and both should be stopped before they reach the
 * database.
 *
 * The store is an interface with an in-memory default. In-memory is honest for a single Vercel
 * instance and wrong across several: each region keeps its own counter, so the effective limit
 * multiplies. Phase 5 swaps in a shared store; the call sites do not change.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** When the window resets, for a Retry-After header. */
  resetAt: Date;
}

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitStore {
  hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitDecision>;
}

/** Sliding window over an in-process map. */
export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>();

  async hit(key: string, rule: RateLimitRule, now: number): Promise<RateLimitDecision> {
    const windowStart = now - rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    // Opportunistic sweep: without it a long-lived process keeps every key it has ever seen.
    if (this.hits.size > 5_000) this.sweep(windowStart);

    if (recent.length >= rule.limit) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(recent[0] + rule.windowMs),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);

    return {
      allowed: true,
      remaining: rule.limit - recent.length,
      resetAt: new Date(now + rule.windowMs),
    };
  }

  private sweep(windowStart: number) {
    for (const [key, times] of this.hits) {
      const kept = times.filter((t) => t > windowStart);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }

  /** Test hook. */
  reset() {
    this.hits.clear();
  }
}

export const BOOKING_LIMITS = {
  /** A shared connection or a café can legitimately produce a few bookings in an hour. */
  perIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** One person booking five times in an hour is a mis-tap or a test, not five appointments. */
  perPhone: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

const defaultStore = new MemoryRateLimitStore();

export interface BookingRateLimitInput {
  ip: string | null;
  phone: string;
  now?: number;
  store?: RateLimitStore;
}

/**
 * Checks both limits. Returns the *first* decision that denies, so the caller can report which
 * limit tripped without leaking the other's counter.
 */
export async function checkBookingRateLimit({
  ip,
  phone,
  now = Date.now(),
  store = defaultStore,
}: BookingRateLimitInput): Promise<{ allowed: boolean; scope?: 'ip' | 'phone'; resetAt?: Date }> {
  if (ip) {
    const byIp = await store.hit(`ip:${ip}`, BOOKING_LIMITS.perIp, now);
    if (!byIp.allowed) return { allowed: false, scope: 'ip', resetAt: byIp.resetAt };
  }

  const byPhone = await store.hit(`phone:${phone}`, BOOKING_LIMITS.perPhone, now);
  if (!byPhone.allowed) return { allowed: false, scope: 'phone', resetAt: byPhone.resetAt };

  return { allowed: true };
}

/** Exposed so tests can start from a clean slate. */
export const __memoryStore = defaultStore;
