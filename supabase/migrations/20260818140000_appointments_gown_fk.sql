-- The foreign key `appointments.gown_id` never had
--
-- `core.sql` declares it as a bare `uuid`, because `gowns` does not exist yet at that point in the
-- migration order and a forward reference will not resolve. The constraint was then never added
-- once the table did exist, so the column has always been a uuid pointing at nothing in particular.
--
-- Two consequences, one of which had been shipping silently:
--
--   1. Nothing stopped an appointment referencing a gown that does not exist.
--   2. PostgREST builds its embedding graph from foreign keys, so `appointments?select=gowns(name)`
--      answered "Could not find a relationship between 'appointments' and 'gowns' in the schema
--      cache" — and `getDayAppointments` treats any error as an empty day.
--
-- The day-line has therefore been blank against every real database since Phase 5. It was invisible
-- because the fallback is silent and correct-looking: a salon with no appointments *should* show an
-- empty day, and the PGlite tests query the tables directly rather than through PostgREST, so they
-- never exercised the embedding at all.
--
-- `not valid` then `validate` keeps this from locking the table against existing rows; there are
-- none today, but this migration will also run on databases where there are.

alter table public.appointments
  add constraint appointments_gown_fk
  foreign key (gown_id) references public.gowns(id) on delete set null
  not valid;

alter table public.appointments validate constraint appointments_gown_fk;
