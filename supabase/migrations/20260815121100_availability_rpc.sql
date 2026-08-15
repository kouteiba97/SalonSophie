-- Public availability inputs
--
-- The engine needs opening hours, each expert's shifts, their time off, and what is already
-- booked. Opening hours are already anon-readable (they belong on a contact page), but
-- `staff_schedules` and `staff_time_off` are not: who works Tuesdays and who is on leave is
-- staff information, and RLS restricts both to the front desk and the person themselves.
--
-- These two functions expose the shape the engine needs and nothing more — a slug and a pair of
-- times. No names, no reasons, no client ever appears. The slot arithmetic stays in TypeScript
-- where it is unit-tested; SQL only supplies the windows.

/** A bookable expert's working windows per calendar day, from their weekly schedule. */
create or replace function public.staff_shift_windows(p_from date, p_to date)
returns table (staff_slug text, on_date date, opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, d.day::date, sch.starts_at, sch.ends_at
  from generate_series(p_from, p_to, interval '1 day') as d(day)
  join public.staff s on s.is_bookable
  join public.staff_schedules sch
    on sch.staff_id = s.id
   and sch.weekday = extract(dow from d.day)::smallint
  order by d.day, s.sort_order, sch.starts_at
$$;

/** Leave, exposed as bare spans so the engine can subtract them. */
create or replace function public.staff_time_off_spans(p_from date, p_to date)
returns table (staff_slug text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, lower(t.period), upper(t.period)
  from public.staff_time_off t
  join public.staff s on s.id = t.staff_id
  where t.period && tstzrange(p_from::timestamptz, (p_to + 1)::timestamptz, '[)')
$$;

grant execute on function public.staff_shift_windows(date, date) to anon, authenticated;
grant execute on function public.staff_time_off_spans(date, date) to anon, authenticated;
