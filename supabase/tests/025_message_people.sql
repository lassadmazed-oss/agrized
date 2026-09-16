-- Test for the second pass: people helped, not a number reached.

-- 1 · The owner's two slogans are on the page --------------------------------------------------------
do $$
begin
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.hero_eyebrow') = 'قوّي دخلك بزيتونتك',
    'the hero carries the income slogan';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.home_subheadline') like '%ويكبر معاك%',
    'the asset grows with the visitor, in his own words';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.home_subheadline') like '%مرتبطة بأرض%',
    'the hero says the tree is tied to land';

  -- Both slogans travel to the calculator beside the ones already there.
  assert (select count(*) from public.settings s, jsonb_array_elements(s.value) v
          where s.key = 'start.values' and v->>'ar' in ('قوّي دخلك بزيتونتك', 'زيتونتك هي مشروعك')) = 2,
    'the calculator carries both slogans';

  assert (select jsonb_array_length(s.value) from public.settings s where s.key = 'start.values') >= 6,
    'the new slogans were added to the calculator, not swapped in';

  -- Every slogan keeps an Arabic line, a French line and a drawing the chooser knows.
  assert not exists (
    select 1 from public.settings s, jsonb_array_elements(s.value) v
    where s.key = 'start.values'
      and (coalesce(btrim(v->>'ar'), '') = '' or coalesce(btrim(v->>'fr'), '') = ''
           or v->>'icon' not in ('people', 'leaf', 'hand', 'chart'))
  ), 'every slogan is bilingual and names a known icon';
end $$;

-- 2 · The counter is about people, not about reaching a number ---------------------------------------
do $$
begin
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.progress_note') like '%قدّاش من شخص%',
    'the counter note counts people helped';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.progress_note') like '%موش نوصلو لرقم%',
    'the counter note says the number is not the goal';

  -- MIL-01: the figures under it stay real counts, so the note must not promise anything either.
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.progress_note') like '%بلا تقديرات ولا وعود%',
    'the counter still refuses estimates and promises';
end $$;

-- 3 · Instalments are a way to start, on the calculator and on a project page -------------------------
do $$
declare
  v_keys text[] := array['start.capacity_hint', 'projects.payment_text'];
  v_miss text;
begin
  select string_agg(s.key, ', ') into v_miss from public.settings s
  where s.key = any (v_keys) and s.value #>> '{}' not like '%يتحوّل الإدخار%';
  assert v_miss is null, 'both instalment texts say what the monthly amount becomes, missing in: ' || coalesce(v_miss, '');

  assert (select s.value #>> '{}' from public.settings s where s.key = 'start.capacity_hint_fr') like '%épargne%',
    'the French twin says the same thing';
end $$;

-- 4 · The §53 vocabulary guard still passes ----------------------------------------------------------
do $$
declare
  v_rule    jsonb := (select s.value from public.settings s where s.key = 'legal.forbidden_phrases');
  v_allowed text[] := array(select jsonb_array_elements_text(v_rule->'allowed_keys'));
  v_hits    text;
begin
  select string_agg(s.key || ' «' || ph.phrase || '»', '; ') into v_hits
  from public.settings s
  join jsonb_array_elements_text(v_rule->'phrases') ph(phrase) on position(ph.phrase in s.value::text) > 0
  where s.is_public and not (s.key = any (v_allowed));
  assert v_hits is null, 'the new copy uses a phrase §53 forbids: ' || coalesce(v_hits, '');

  -- PRN-01: an income can be strengthened, never owed. The notice that says so stays public and filled.
  assert (select length(btrim(s.value #>> '{}')) > 0 and s.is_public
          from public.settings s where s.key = 'legal.no_guarantee_notice'),
    'the no-guarantee notice is still on the site next to the income slogan';
end $$;

-- 5 · A visitor reads it all through the public policy ------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings
          where key in ('site.hero_eyebrow', 'site.home_subheadline', 'site.progress_note', 'start.values')) = 4,
    'visitors read the slogans, the counter note and the calculator values';
end $$;

reset role;
