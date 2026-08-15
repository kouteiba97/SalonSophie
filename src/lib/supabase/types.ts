/**
 * Database types.
 *
 * Hand-written for the tables the public site reads, because no Supabase project is provisioned
 * yet. Once one exists, regenerate the whole file and delete this note:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 *
 * Only the public catalogue is modelled here. Staff-console tables land with Phase 5, at which
 * point generation replaces this entirely.
 */

export type PriceKind = 'fixed' | 'range' | 'from' | 'addon' | 'free';
export type GownTier = 'Essential' | 'Signature' | 'Couture';
export type GownState = 'available' | 'rented' | 'cleaning' | 'repair';

export interface ServiceCategoryRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceRow {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: PriceKind;
  /** Centimes. Null only when kind is 'free'. */
  price_min: number | null;
  /** Centimes. Only set when kind is 'range'. */
  price_max: number | null;
  /** Null until real durations are supplied — never invented (§6). */
  duration_minutes: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface GownRow {
  id: string;
  slug: string;
  name: string;
  tier: GownTier;
  silhouette: string | null;
  state: GownState;
  size_min: number;
  size_max: number;
  /** Centimes, or null — unknown (§6). */
  rental_price: number | null;
  image_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface AccessoryRow {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface BusinessHoursRow {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

export interface BusinessHourExceptionRow {
  on_date: string;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

/* ── RPC shapes ──────────────────────────────────────────────────────────────────────────── */

/** `busy_spans` and `staff_time_off_spans` — occupied time, with no client attached. */
export interface SpanRow {
  staff_slug: string;
  starts_at: string;
  ends_at: string;
}

/** `staff_shift_windows` — a bookable expert's working window for one day. */
export interface ShiftWindowRow {
  staff_slug: string;
  on_date: string;
  opens_at: string;
  closes_at: string;
}

export interface BookAppointmentArgs {
  p_service_slug: string | null;
  p_gown_slug: string | null;
  p_staff_slug: string | null;
  p_start: string;
  p_client_name: string;
  p_client_phone: string;
  p_notes: string | null;
}

export interface BookAppointmentRow {
  reference: string;
  appointment_id: string;
  staff_slug: string | null;
  is_request: boolean;
}

interface DateRangeArgs {
  p_from: string;
  p_to: string;
}

/**
 * supabase-js infers result types from Row/Insert/Update together; supplying Row alone makes
 * every query resolve to `never`. The public site never writes, so Insert and Update are just
 * the Row shape with optional fields.
 */
type Writable<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      service_categories: Writable<ServiceCategoryRow>;
      services: Writable<ServiceRow>;
      gowns: Writable<GownRow>;
      accessories: Writable<AccessoryRow>;
      business_hours: Writable<BusinessHoursRow>;
      business_hour_exceptions: Writable<BusinessHourExceptionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      book_appointment: { Args: BookAppointmentArgs; Returns: BookAppointmentRow };
      busy_spans: { Args: DateRangeArgs; Returns: SpanRow[] };
      staff_shift_windows: { Args: DateRangeArgs; Returns: ShiftWindowRow[] };
      staff_time_off_spans: { Args: DateRangeArgs; Returns: SpanRow[] };
    };
    Enums: {
      price_kind: PriceKind;
      gown_tier: GownTier;
      gown_state: GownState;
    };
    CompositeTypes: Record<string, never>;
  };
}
