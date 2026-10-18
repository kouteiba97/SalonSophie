-- The salon's real opening hours, and sixteen real service durations
--
-- §6 listed both as unknown, and the seed held the line: business_hours shipped empty and
-- duration_minutes was null for all fifty-five services. The salon has now given the hours and
-- part of the durations, so they stop being unknown and become data.
--
-- ── Hours ────────────────────────────────────────────────────────────────────────────────────
-- Open 09:30–17:00, closed Sunday. This was the single highest-leverage gap on the list: with no
-- hours the availability engine cannot place a slot at all, so every booking degraded to a
-- request the salon had to chase on WhatsApp.
--
-- Worth recording that the design was not merely vague here, it was wrong in three ways at once:
-- it invented 09 h – 19 h, and hardcoded `d.getDay() === 5` to close Friday. The salon trades on
-- Friday and closes on Sunday, and shuts two hours earlier than the mockup claimed. Shipping the
-- prototype's values would have turned clients away on Friday and sent them to a locked door on
-- Sunday — the precise failure §6 exists to prevent.
--
-- ── Durations ────────────────────────────────────────────────────────────────────────────────
-- Sixteen of fifty-five. The rest stay null, which the engine already reads as "cannot size this
-- slot" and answers with a request. Partial is the honest state: a service with a duration is now
-- properly bookable, and one without behaves exactly as it did yesterday.
--
-- Deliberately not spread any wider than the salon actually said. "nails : 2 h" covers the five
-- full poses, not the 500 DA Déco supplement; "foot care : 45 min" covers the two Soin lines, not
-- the pédicure gel work. A guessed duration does not fail loudly — it quietly offers a client a
-- slot that is too short, and nobody finds out until she is sitting in the chair.
--
-- Four durations the salon gave have no line in the published tariff to attach to — maquillage,
-- maquillage + coiffure, coloration and mèches. They are left out rather than invented, because
-- creating a service means inventing its price. docs/OPEN_QUESTIONS.md carries the question.
--
-- Idempotent: safe to re-run.

do $$
declare
  v_tenant   uuid := 'a0000000-0000-4000-8000-000000000001';
  v_location uuid := 'a0000000-0000-4000-8000-000000000002';
begin

  -- ── the trading week ───────────────────────────────────────────────────────────────────────
  -- weekday 0 = Sunday .. 6 = Saturday, matching JS getDay() and src/data/business.ts.
  insert into public.business_hours (tenant_id, location_id, weekday, opens_at, closes_at, is_closed)
  values
    (v_tenant, v_location, 0, null,    null,    true),   -- dimanche — fermé
    (v_tenant, v_location, 1, '09:30', '17:00', false),
    (v_tenant, v_location, 2, '09:30', '17:00', false),
    (v_tenant, v_location, 3, '09:30', '17:00', false),
    (v_tenant, v_location, 4, '09:30', '17:00', false),
    (v_tenant, v_location, 5, '09:30', '17:00', false),
    (v_tenant, v_location, 6, '09:30', '17:00', false)
  on conflict (location_id, weekday) do update
    set opens_at  = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = excluded.is_closed;

  /*
   * ── clear the guesses before writing the real values ─────────────────────────────────────
   *
   * The seed ships every duration null, but the live database does not: all fifty-five were
   * filled in with invented lengths so the platform could be demonstrated (balayage 150 min,
   * coupe 45 min, brushing 30 min). The same seeding put the design's invented hours in
   * alongside them — 09 h – 19 h with Friday closed — which is how we know the guesses track
   * the mockup rather than the salon.
   *
   * Only sixteen of them have a real answer, so the other thirty-nine go back to null. Null is
   * not a gap here, it is the instruction the booking RPC reads as "cannot size this slot" and
   * answers with a WhatsApp request. A guess does not fail loudly: it books a client into a slot
   * of the wrong length, and nobody finds out until she is in the chair and the next client is
   * waiting.
   *
   * Clearing first also makes this re-runnable and self-correcting — a duration removed from the
   * list below is actually removed from the database, rather than lingering from an earlier run.
   */
  update public.services
     set duration_minutes = null
   where tenant_id = v_tenant
     and duration_minutes is not null;

  -- ── durations the salon gave ───────────────────────────────────────────────────────────────
  update public.services s
     set duration_minutes = v.minutes
    from (values
      -- brushing : 15 min, all four lengths. The two Coupe + brushing lines stay null: the cut
      -- adds time nobody has quantified.
      ('brushing-courts',              15),
      ('brushing-mi-longs',            15),
      ('brushing-longs',               15),
      ('brushing-tres-tres-longs',     15),

      -- hair care : 5 h. The 14 000 – 35 000 DA range is the long treatment, not a wash.
      ('soins-capillaires',           300),

      -- facial simple / profond / hydro : 1 h each.
      ('soin-visage-simple',           60),
      ('soin-visage-profond',          60),
      ('hydra-facial',                 60),

      -- hand care : 30 min.
      ('soin-des-mains',               30),

      -- nails : 2 h — the five full poses only.
      ('pose-capsule',                120),
      ('gel-ongle-naturel',           120),
      ('french-pose-capsule',         120),
      ('french-gel-ongle-naturel',    120),
      ('babyboomer',                  120),

      -- foot care : 45 min — the two Soin lines; the rest of Pédicure is nail work.
      ('pedicure-soin-sans-paraffine', 45),
      ('pedicure-soin-avec-paraffine', 45)
    ) as v(slug, minutes)
   where s.tenant_id = v_tenant
     and s.slug = v.slug;

  /*
   * Fail loudly if a slug drifted.
   *
   * An UPDATE ... FROM that matches nothing succeeds silently, so a renamed slug would leave the
   * duration null and the service quietly unbookable — the migration would report success and
   * the salon would wonder why that line never offers a time.
   */
  if (select count(*) from public.services
       where tenant_id = v_tenant and duration_minutes is not null) <> 16 then
    raise exception 'expected 16 services with a duration, found %',
      (select count(*) from public.services
        where tenant_id = v_tenant and duration_minutes is not null);
  end if;

end $$;
