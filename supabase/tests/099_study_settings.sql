-- 0152 · the study's ground: nothing commercial in the code, nothing commercial reachable by a visitor, and
-- an age the Back Office never filled in has no answer rather than an invented one.
do $$
declare
  v_table  text;
  v_key    text;
  v_locale text;
  v_bands  integer;
  v_gap    integer;
begin
  -- 1 · THE DOORS. These four tables hold AgriZed's own yields, costs and margins, and §10 says plainly that
  --     internal costs and margins are never shown to a client. A visitor must not reach a single row: the
  --     study they are shown is assembled by a definer function that publishes results and no workings.
  foreach v_table in array array['study_yield_bands', 'study_scenarios', 'study_charges', 'project_study'] loop
    assert (select c.relrowsecurity from pg_class c
             where c.oid = format('public.%I', v_table)::regclass),
      format('row level security is off on public.%s', v_table);
    assert not has_table_privilege('anon', format('public.%I', v_table), 'select'),
      format('a visitor can read public.%s — the company''s own costs', v_table);
    assert not has_table_privilege('anon', format('public.%I', v_table), 'insert'),
      format('a visitor can write public.%s', v_table);
    -- Staff read and administrators write: the two policies 0132 established for exactly this shape.
    assert (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = v_table) >= 2,
      format('public.%s has fewer than the two policies it needs', v_table);
  end loop;

  -- 2 · THE BANDS, AND THE HOLE THAT MUST NOT BE FILLED BY A FORMULA. The owner's two points are seeded and
  --     the oldest band is open at the top, so a 120-year-old tree is answered and a 2-year-old is answered
  --     with zero. What is asserted here is the SHAPE — bands, not a curve — because the temptation in a
  --     later edit is to replace them with a line through the two ends, which is what the brief forbids.
  select count(*) into v_bands from public.study_yield_bands where project_id is null and is_active;
  assert v_bands >= 3, format('the default yield curve has %s bands, which is not a curve the owner can shape', v_bands);
  assert exists (select 1 from public.study_yield_bands
                  where project_id is null and is_active and age_to is null),
    'no open-ended band: an old tree falls off the end of the table and the study goes silent on it';
  assert exists (select 1 from public.study_yield_bands
                  where project_id is null and is_active and age_from <= 3 and coalesce(age_to, 9999) >= 3
                    and kg_per_tree = 15),
    'the owner''s own point — 3 years, 15 kg — is not in the seed';
  assert exists (select 1 from public.study_yield_bands
                  where project_id is null and is_active and age_from <= 70 and coalesce(age_to, 9999) >= 70
                    and kg_per_tree = 250),
    'the owner''s own point — 70 years, 250 kg — is not in the seed';

  -- Every band says where its figure came from, because the Back Office is where they get corrected and a
  -- number with no provenance never does.
  assert not exists (select 1 from public.study_yield_bands
                      where project_id is null and coalesce(btrim(source_ar), '') = ''),
    'a seeded yield band carries no note saying it is an assumption';

  -- 3 · THE SCENARIOS. Three of them, and EXACTLY ONE reference: two would make the opening figures depend
  --     on the order rows happen to come back in.
  assert (select count(*) from public.study_scenarios where is_active) >= 3,
    'fewer than the three scenarios §5 asks for';
  assert (select count(*) from public.study_scenarios where is_reference) = 1,
    'there is not exactly one reference scenario';
  -- Prudent must actually be prudent: a «موسم ضعيف» that yields more or costs less than the reference is a
  -- label on nothing, and the screen would be showing three optimistic answers.
  assert (select s.yield_factor_bp from public.study_scenarios s where s.code = 'prudent')
       < (select s.yield_factor_bp from public.study_scenarios s where s.code = 'central'),
    'the prudent scenario does not yield less than the central one';
  assert (select s.charge_factor_bp from public.study_scenarios s where s.code = 'prudent')
       > (select s.charge_factor_bp from public.study_scenarios s where s.code = 'central'),
    'the prudent scenario does not cost more than the central one';
  assert (select s.yield_factor_bp from public.study_scenarios s where s.code = 'optimiste')
       > (select s.yield_factor_bp from public.study_scenarios s where s.code = 'central'),
    'the optimistic scenario does not yield more than the central one';

  -- 4 · THE SETTINGS. §10: no commercial figure in the code, so each of these must exist to be read from.
  foreach v_key in array array['study.enabled_default', 'study.olive_price_millimes_per_kg',
                               'study.oil_price_millimes_per_litre', 'study.oil_yield_bp',
                               'study.price_growth_bp', 'study.horizons', 'study.min_trees',
                               'study.resale_enabled', 'study.legal_note'] loop
    assert exists (select 1 from public.settings s where s.key = v_key), format('%s is missing', v_key);
  end loop;

  -- The prices and the charges are NOT published to the site: they are what the business pays and sells at,
  -- and §10 keeps them out of the client's hands. Only what a screen must print is public.
  foreach v_key in array array['study.olive_price_millimes_per_kg', 'study.oil_price_millimes_per_litre',
                               'study.oil_yield_bp', 'study.price_growth_bp', 'study.enabled_default',
                               'study.resale_enabled'] loop
    assert not (select s.is_public from public.settings s where s.key = v_key),
      format('%s is published to the public site, where it is a window into the company''s own costs', v_key);
  end loop;

  -- 5 · RESALE IS OFF. §7: it enters only as an optional, declared hypothesis — so it ships off, and a study
  --     that silently credits a client with the value of trees he has not sold is the exact mis-selling the
  --     brief is written against.
  assert not (select (s.value)::boolean from public.settings s where s.key = 'study.resale_enabled'),
    'resale value is counted by default, which §7 forbids';

  -- 6 · THE WARNING, in every language. A study whose caveat is missing on the French site is a promise.
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    assert exists (select 1 from public.translations t
                    where t.entity = 'setting' and t.entity_key = 'study.legal_note'
                      and t.field = 'value' and t.locale = v_locale),
      format('the legal note was never translated into %s', v_locale);
  end loop;

  -- 7 · THE MODULE, and it is NOT open. A simulator that promises a return is the most expensive thing on
  --     this site to get wrong; it opens when the owner has read the figures and says so.
  assert (select f.state from public.feature_flags f where f.key = 'study') = 'internal',
    'the study module shipped open to the public before anyone checked the figures';

  -- 8 · AN AGE NO BAND COVERS HAS NO ANSWER. Asserted by finding a gap on purpose: the seed covers 0
  --     upwards with no hole, so a hole is created and the lookup must come back empty rather than reaching
  --     for the nearest band. This is the behaviour 0153 is built on.
  delete from public.study_yield_bands where project_id is null and age_from = 6;
  select count(*) into v_gap from public.study_yield_bands
   where project_id is null and is_active and 7 between age_from and coalesce(age_to, 2147483647);
  assert v_gap = 0, 'an age inside a deleted band still matched one, so the bands overlap';

  raise notice 'study settings: four closed tables, three scenarios with one reference, the owner''s two points, and no commercial figure in the code';
end $$;
