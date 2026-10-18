-- Realign staff shifts to the salon's real trading week
--
-- 20261018090000 corrected `business_hours` to 09:30–17:00 with Sunday closed. It did not touch
-- `staff_schedules`, and that turned out to matter: the availability engine offers a slot only
-- where opening hours and a staff member's shift overlap, so the shifts are half of the answer.
--
-- `give_default_schedule` copies the salon's opening hours into a new staff member's schedule at
-- the moment their account is created. That is a sound default — a stylist with no shift silently
-- cannot be booked, which is worse than a default anyone can edit in one screen — but it is a
-- *snapshot*. Every account on this database was created while `business_hours` still held the
-- design's invented week, so all three carry it:
--
--     scheduled 09:00–19:00, every day including Sunday, except Friday
--
-- Against corrected opening hours that produced one visible bug and one accident:
--
--   * Friday — the salon trades, no stylist has a shift, so the engine offered nothing. Every
--     client was turned away from a working Friday. The design's `d.getDay() === 5` outliving
--     the code it came from, in a table nobody thought to look at.
--   * Sunday — stylists were scheduled on a day the salon is shut. Harmless only because
--     `business_hours` now closes it; the intersection is empty either way. Two wrongs agreeing.
--   * 09:00 and 19:00 — clipped to 09:30–17:00 by the intersection, so never wrong, just dead
--     weight that would have come alive the moment opening hours were widened again.
--
-- So: rebuild every bookable staff member's schedule from the trading week, the same rule
-- `give_default_schedule` applies to a new hire. This propagates hours the salon gave rather than
-- inventing anything — but it does assume all three work the full week, and that is a genuine
-- unknown. Per-person days are editable from /equipe and recorded in docs/OPEN_QUESTIONS.md.
--
-- Deliberately not rewritten to derive shifts from `business_hours` at query time. A stylist who
-- works Tuesdays and Thursdays is the normal case for a salon, and a derived view could not
-- express it — the snapshot is the right shape, it was just never refreshed.
--
-- Idempotent: safe to re-run.

do $$
declare
  v_tenant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_rows   integer;
begin

  /*
   * Replace rather than update: a stale row for a day the salon no longer trades has to go, and
   * a day it newly trades has to appear. An UPDATE could do neither.
   *
   * Scoped to bookable staff. Someone deliberately made unbookable should not quietly acquire a
   * full week of shifts and reappear in the booking flow.
   */
  delete from public.staff_schedules sch
   using public.staff s
   where sch.staff_id = s.id
     and sch.tenant_id = v_tenant
     and s.is_bookable;

  insert into public.staff_schedules (tenant_id, staff_id, weekday, starts_at, ends_at)
  select v_tenant, s.id, h.weekday, h.opens_at, h.closes_at
    from public.staff s
    join public.business_hours h
      on h.tenant_id = s.tenant_id
   where s.tenant_id = v_tenant
     and s.is_bookable
     and not h.is_closed
     and h.opens_at is not null
     and h.closes_at is not null;

  get diagnostics v_rows = row_count;

  /*
   * A salon with no bookable staff, or no open day, would leave this empty and every date in the
   * calendar unavailable — with the engine reporting "full" rather than anything diagnosable.
   */
  if v_rows = 0 then
    raise exception 'no shifts written: % bookable staff, % open days',
      (select count(*) from public.staff where tenant_id = v_tenant and is_bookable),
      (select count(*) from public.business_hours where tenant_id = v_tenant and not is_closed);
  end if;

  raise notice 'staff_schedules rebuilt: % shifts', v_rows;
end $$;
