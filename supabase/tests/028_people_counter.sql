-- «وين وصلنا؟» leads with people: the lead line, the bands that turn the live count into a word, and the
-- encouragement are all Back Office settings (owner, 2026-09-16). Spec: MIL-01, MIL-02, PRN-01, PRN-02.
--
-- Runs against the live database: reads settings and the public counter, writes nothing outside the rolled-back
-- transaction.

do $$
declare
  v_keys  text[] := array['million.people_lead', 'million.people_lead_fr', 'million.people_bands',
                          'million.people_bands_fr', 'million.people_encourage', 'million.people_encourage_fr'];
  v_found bigint;
  v_bands jsonb;
begin
  select count(*) into v_found from public.settings s where s.key = any (v_keys) and s.is_public;
  assert v_found = cardinality(v_keys),
    'every people setting exists and is public: expected ' || cardinality(v_keys) || ', got ' || v_found;

  -- The visitor reads a word, so the line must carry the placeholder the word replaces.
  assert (select value #>> '{}' like '%{people}%' from public.settings where key = 'million.people_lead'),
    'the lead line carries {people}, got ' || (select value #>> '{}' from public.settings where key = 'million.people_lead');

  -- MIL-01: the band is picked by the real count, so each one needs a threshold and a word.
  select value into v_bands from public.settings where key = 'million.people_bands';
  assert jsonb_typeof(v_bands) = 'array' and jsonb_array_length(v_bands) > 0,
    'the bands are a non-empty array, got ' || v_bands::text;
  assert not exists (
    select 1 from jsonb_array_elements(v_bands) b
    where jsonb_typeof(b) <> 'object'
       or (b->>'min') is null
       or (b->>'min') !~ '^[0-9]+$'
       or coalesce(btrim(b->>'text'), '') = ''
  ), 'every band carries a whole «min» and a «text», got ' || v_bands::text;
  assert (select count(distinct (b->>'min')::bigint) from jsonb_array_elements(v_bands) b) = jsonb_array_length(v_bands),
    'the thresholds do not repeat, got ' || v_bands::text;
  assert exists (select 1 from jsonb_array_elements(v_bands) b where (b->>'min')::bigint <= 1),
    'a band covers the very first participant, got ' || v_bands::text;

  -- The French twin, when it is filled, has to describe the same ladder.
  assert (select jsonb_array_length(value) = jsonb_array_length(v_bands) from public.settings where key = 'million.people_bands_fr'),
    'the French bands match the Arabic ones one for one';

  -- PRN-01: the section reports, it never promises.
  assert not exists (
    select 1 from public.settings s
    where s.key = any (v_keys)
      and (s.value #>> '{}') ~ '(ربح|أرباح|مردود|مضمون|عائد|استرجاع|rendement|b[ée]n[ée]fice)'
  ), 'nothing in the people copy promises a return';
end $$;

-- The count behind the word is the real one, and a visitor may read it (FLAG-01: statistics are public).
do $$
declare
  v_progress jsonb;
  v_people   bigint;
begin
  set local role anon;
  v_progress := public.million_progress();
  reset role;

  assert v_progress ? 'participants', 'the public counter reports participants, got ' || v_progress::text;
  v_people := (v_progress->>'participants')::bigint;
  assert v_people >= 0, 'the participant count is a real count, got ' || v_people;

  -- The same rule the page applies: the largest band the count reaches wins, and it must resolve to a word.
  if v_people >= 1 then
    assert (
      select coalesce(btrim(b->>'text'), '') <> ''
      from public.settings s, jsonb_array_elements(s.value) b
      where s.key = 'million.people_bands' and (b->>'min')::bigint <= v_people
      order by (b->>'min')::bigint desc
      limit 1
    ), 'the live count of ' || v_people || ' people resolves to a word';
  end if;
end $$;
