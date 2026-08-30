-- Provisional values, and a list of what still needs confirming
--
-- §6 says not to invent business data, and that rule has held all the way here: every unknown
-- rendered as an em dash rather than a plausible number. The owner has now asked for durations,
-- opening hours and gown prices to be filled in so the platform can be demonstrated end to end,
-- with the real figures to follow after they are checked with Sophie.
--
-- Seeding them without a way to tell them apart afterwards is how an invented number becomes a
-- permanent one: nobody remembers which values were guessed six weeks later. So a seeded value is
-- recorded here as provisional, the console shows what is outstanding, and an owner confirms each
-- group once the real answer is in. The point of §6 was never the em dash — it was never letting a
-- guess pass silently for a fact.
--
-- `data_gaps()` counted NULLs. It cannot see a filled-in guess, which is exactly why this exists.

create table public.provisional_data (
  key text primary key,
  label text not null,
  /** Why it matters, so the console can say what confirming it unlocks. */
  note text,
  seeded_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.users(id) on delete set null
);

alter table public.provisional_data enable row level security;
alter table public.provisional_data force row level security;

create policy provisional_data_read on public.provisional_data
  for select to authenticated using (public.is_front_desk());

create policy provisional_data_owner_write on public.provisional_data
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

grant select on public.provisional_data to authenticated;
grant insert, update, delete on public.provisional_data to authenticated;
revoke all on public.provisional_data from anon;

/*
 * Confirming is deliberately one click per group rather than per row.
 *
 * Sophie will confirm "yes, those durations are right" in one conversation, not fifty-five times.
 * A per-row workflow nobody completes leaves the list permanently half-red, which is the same as
 * having no list.
 */
create or replace function public.confirm_provisional(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.is_owner() then raise exception 'provisional_forbidden'; end if;

  update public.provisional_data
     set confirmed_at = now(), confirmed_by = (select auth.uid())
   where key = p_key;

  if not found then raise exception 'provisional_not_found'; end if;
end;
$fn$;

/** Undo, for when a confirmation turns out to have been optimistic. */
create or replace function public.unconfirm_provisional(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.is_owner() then raise exception 'provisional_forbidden'; end if;
  update public.provisional_data set confirmed_at = null, confirmed_by = null where key = p_key;
  if not found then raise exception 'provisional_not_found'; end if;
end;
$fn$;

revoke execute on function
  public.confirm_provisional(text), public.unconfirm_provisional(text) from public, anon;
grant execute on function
  public.confirm_provisional(text), public.unconfirm_provisional(text) to authenticated;
