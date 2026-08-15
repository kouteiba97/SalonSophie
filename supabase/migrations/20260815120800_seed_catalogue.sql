-- Seed: the real published tariff, the three gowns, the accessories
--
-- BUILD_BRIEF §6, and §14: "Seed realistically — an empty app cannot be evaluated."
--
-- Everything here is data the business actually published. Nothing that §6 lists as unknown is
-- filled in: durations stay null, gown rental prices stay null, business_hours ships empty
-- rather than repeating the design's invented "Samedi – Jeudi 09 h – 19 h", and the staff list
-- is the two confirmed sisters — not the design's Amina and Lynda.
--
-- Idempotent: safe to re-run.

-- Deterministic ids so re-running is a no-op and environments line up.
do $$
declare
  v_tenant   uuid := 'a0000000-0000-4000-8000-000000000001';
  v_location uuid := 'a0000000-0000-4000-8000-000000000002';
begin

  insert into public.tenants (id, name)
  values (v_tenant, 'The Sisters N&S')
  on conflict (id) do nothing;

  insert into public.locations (id, tenant_id, name, street, landmark, city, country, phone)
  values (
    v_location, v_tenant, 'N&S — Nouvelle Ville',
    'UV5, Nouvelle Ville Ali Mendjeli',
    'À côté de l''école Cirta',
    'Constantine', 'DZ',
    -- The salon's one real line (§1). Never the design's +213 661 23 45 67 placeholder.
    '0553366712'
  )
  on conflict (id) do nothing;

  /*
   * business_hours is deliberately left empty.
   *
   * Opening hours are unknown (§6). An empty table makes the calendar say "we don't know yet";
   * a seeded guess would make it say something false to a client planning her week.
   */

  -- ── the two confirmed sisters ──────────────────────────────────────────────────────────────
  insert into public.staff (tenant_id, location_id, display_name, slug, specialty, sort_order)
  values
    (v_tenant, v_location, 'Nour',   'nour',   'Coiffure & mariée', 1),
    (v_tenant, v_location, 'Sophie', 'sophie', 'Soins & visage',    2)
  on conflict (tenant_id, slug) do nothing;

  -- ── categories ─────────────────────────────────────────────────────────────────────────────
  insert into public.service_categories (tenant_id, slug, name, sort_order)
  values
    (v_tenant, 'coiffure',          'Coiffure',          1),
    (v_tenant, 'soins-capillaires', 'Soins Capillaires', 2),
    (v_tenant, 'soin-de-visage',    'Soin de Visage',    3),
    (v_tenant, 'nails',             'Nails',             4),
    (v_tenant, 'pedicure',          'Pédicure',          5),
    (v_tenant, 'extension-de-cils', 'Extension de Cils', 6),
    (v_tenant, 'epilation',         'Épilation',         7),
    (v_tenant, 'massage',           'Massage',           8)
  on conflict (tenant_id, slug) do nothing;

  -- ── services: the §6 tariff, prices in centimes ────────────────────────────────────────────
  -- duration_minutes is omitted throughout: unknown for every service.
  insert into public.services (tenant_id, category_id, slug, name, kind, price_min, price_max, sort_order)
  select
    v_tenant,
    c.id,
    v.slug,
    v.name,
    v.kind::public.price_kind,
    case when v.min_da is null then null else v.min_da * 100 end,
    case when v.max_da is null then null else v.max_da * 100 end,
    v.sort_order
  from (values
    -- Coiffure
    ('coiffure', 'coupe',                        'Coupe',                          'fixed',   700,   null,  1),
    ('coiffure', 'coupe-brushing-courts',        'Coupe + brushing courts',        'fixed',  1200,   null,  2),
    ('coiffure', 'coupe-brushing-longs',         'Coupe + brushing longs',         'fixed',  1500,   null,  3),
    ('coiffure', 'brushing-courts',              'Brushing courts',                'fixed',  1000,   null,  4),
    ('coiffure', 'brushing-mi-longs',            'Brushing mi-longs',              'fixed',  1200,   null,  5),
    ('coiffure', 'brushing-longs',               'Brushing longs',                 'fixed',  1500,   null,  6),
    ('coiffure', 'brushing-tres-tres-longs',     'Brushing très très longs',       'fixed',  2000,   null,  7),
    -- Soins Capillaires
    ('soins-capillaires', 'soins-capillaires',   'Soins capillaires',              'range', 14000, 35000,  1),
    ('soins-capillaires', 'ccrp',                'CCRP',                           'from',   6000,   null,  2),
    ('soins-capillaires', 'balayage',            'Balayage',                       'from',  16000,   null,  3),
    -- Soin de Visage
    ('soin-de-visage', 'soin-visage-simple',     'Soin de visage simple',          'fixed',  3500,   null,  1),
    ('soin-de-visage', 'soin-visage-profond',    'Soin de visage profond',         'fixed',  5000,   null,  2),
    ('soin-de-visage', 'hydra-facial',           'Hydra Facial',                   'fixed',  8000,   null,  3),
    ('soin-de-visage', 'soin-des-mains',         'Soin des mains',                 'fixed',  2500,   null,  4),
    -- Nails
    ('nails', 'pose-capsule',                    'Pose capsule',                   'fixed',  4000,   null,  1),
    ('nails', 'gel-ongle-naturel',               'Gel sur ongle naturel',          'fixed',  3500,   null,  2),
    ('nails', 'verni-semi-permanent',            'Verni semi-permanent',           'fixed',  2500,   null,  3),
    ('nails', 'remplissage',                     'Remplissage',                    'fixed',  3500,   null,  4),
    ('nails', 'depose-manucure-russe',           'Dépose + manucure russe',        'fixed',  2000,   null,  5),
    ('nails', 'manucure-russe',                  'Manucure russe',                 'fixed',  1000,   null,  6),
    ('nails', 'french-pose-capsule',             'French pose capsule',            'fixed',  4500,   null,  7),
    ('nails', 'french-gel-ongle-naturel',        'French gel sur ongle naturel',   'fixed',  4000,   null,  8),
    ('nails', 'babyboomer',                      'Babyboomer',                     'fixed',  5000,   null,  9),
    ('nails', 'deco',                            'Déco',                           'addon',   500,   null, 10),
    -- Pédicure
    ('pedicure', 'pedicure-capsule',             'Capsule',                        'fixed',  3500,   null,  1),
    ('pedicure', 'pedicure-gel-ongle-naturel',   'Gel sur ongle naturel',          'fixed',  3000,   null,  2),
    ('pedicure', 'pedicure-semi-permanent',      'Semi-permanent',                 'fixed',  2500,   null,  3),
    ('pedicure', 'pedicure-soin-sans-paraffine', 'Soin sans paraffine',            'fixed',  3000,   null,  4),
    ('pedicure', 'pedicure-soin-avec-paraffine', 'Soin avec paraffine',            'fixed',  3500,   null,  5),
    ('pedicure', 'pedicure-peeling',             'Peeling',                        'fixed',  5000,   null,  6),
    -- Extension de Cils
    ('extension-de-cils', 'cils-effet-naturel',       'Effet naturel',             'fixed',  4000,   null,  1),
    ('extension-de-cils', 'cils-effet-naturel-mixte', 'Effet naturel mixte',       'fixed',  5000,   null,  2),
    ('extension-de-cils', 'cils-effet-mixte',         'Effet mixte',               'fixed',  6500,   null,  3),
    ('extension-de-cils', 'cils-effet-russe',         'Effet russe',               'fixed',  8000,   null,  4),
    ('extension-de-cils', 'rehaussement',             'Rehaussement',              'fixed',  3500,   null,  5),
    ('extension-de-cils', 'rehaussement-teinture',    'Rehaussement + teinture',   'fixed',  4500,   null,  6),
    ('extension-de-cils', 'brow-lifting',             'Brow lifting',              'fixed',  3500,   null,  7),
    ('extension-de-cils', 'brow-lifting-teinture',    'Brow lifting + teinture',   'fixed',  4500,   null,  8),
    -- Épilation
    ('epilation', 'epilation-levre-superieure',    'Lèvre supérieure',             'fixed',   200,   null,  1),
    ('epilation', 'epilation-sourcils',            'Sourcils',                     'fixed',   600,   null,  2),
    ('epilation', 'epilation-aisselles',           'Aisselles',                    'fixed',   600,   null,  3),
    ('epilation', 'epilation-demi-bras',           'Demi-bras',                    'fixed',  1000,   null,  4),
    ('epilation', 'epilation-visage-sans-sourcils','Visage sans sourcils',         'fixed',  1000,   null,  5),
    ('epilation', 'epilation-ventre',              'Ventre',                       'fixed',  1000,   null,  6),
    ('epilation', 'epilation-demi-jambes',         'Demi-jambes',                  'fixed',  1000,   null,  7),
    ('epilation', 'epilation-cuisse',              'Cuisse',                       'fixed',  1000,   null,  8),
    ('epilation', 'epilation-bras',                'Bras',                         'fixed',  1800,   null,  9),
    ('epilation', 'epilation-jambes',              'Jambes',                       'fixed',  2000,   null, 10),
    ('epilation', 'epilation-fessier',             'Fessier',                      'fixed',  3000,   null, 11),
    ('epilation', 'epilation-dos',                 'Dos',                          'fixed',  4000,   null, 12),
    ('epilation', 'epilation-maillot',             'Maillot',                      'fixed',  4000,   null, 13),
    -- Massage
    ('massage', 'massage-corps-complet',           'Corps complet',                'fixed',  7000,   null,  1),
    ('massage', 'massage-ventre-dos',              'Ventre et dos',                'fixed',  4000,   null,  2),
    ('massage', 'massage-cuisses-mollets',         'Cuisses et mollets',           'fixed',  4000,   null,  3),
    -- Free with any massage (§6).
    ('massage', 'massage-visage',                  'Visage',                       'free',   null,   null,  4)
  ) as v(category_slug, slug, name, kind, min_da, max_da, sort_order)
  join public.service_categories c
    on c.tenant_id = v_tenant and c.slug = v.category_slug
  on conflict (tenant_id, slug) do nothing;

  -- ── gowns ──────────────────────────────────────────────────────────────────────────────────
  -- Names, tiers and size ranges come from the approved design; §6 does not list them among the
  -- unknowns. Rental price does stay unknown, so it is null and renders "Sur devis".
  insert into public.gowns
    (tenant_id, slug, name, tier, silhouette, size_min, size_max, rental_price, image_id, sort_order)
  values
    (v_tenant, 'anastasia', 'Anastasia', 'Signature',
     'Traîne cathédrale, dentelle rebrodée main, dos boutonné.', 36, 42, null, 'ns-gown-anastasia', 1),
    (v_tenant, 'abir', 'ABir', 'Essential',
     'Ligne A intemporelle, manches illusion, jupe en mikado.',  38, 44, null, 'ns-gown-abir', 2),
    (v_tenant, 'ryma', 'RYMA', 'Couture',
     'Bustier corseté, perlage cristal, jupe amovible.',          36, 40, null, 'ns-gown-ryma', 3)
  on conflict (tenant_id, slug) do nothing;

  -- Discrete sizes, so a card never promises a size the rail does not hold.
  insert into public.gown_sizes (tenant_id, gown_id, size)
  select v_tenant, g.id, s.size
  from public.gowns g
  cross join lateral generate_series(g.size_min, g.size_max, 2) as s(size)
  where g.tenant_id = v_tenant
  on conflict (gown_id, size) do nothing;

  -- ── accessories ────────────────────────────────────────────────────────────────────────────
  -- Stock counts and prices are not known, so they stay at the column defaults.
  insert into public.accessories (tenant_id, slug, name)
  values
    (v_tenant, 'barnous', 'Barnous'),
    (v_tenant, 'diademe', 'Diadème'),
    (v_tenant, 'voile',   'Voile')
  on conflict (tenant_id, slug) do nothing;

end $$;
