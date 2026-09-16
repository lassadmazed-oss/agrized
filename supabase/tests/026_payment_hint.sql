-- Test for the instalment line under the payment question.

-- 1 · The line exists in both languages, as public site copy ----------------------------------------
do $$
declare
  v_keys text[] := array['start.payment_hint', 'start.payment_hint_fr'];
  v_found bigint;
begin
  select count(*) into v_found from public.settings s
  where s.key = any (v_keys) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_keys),
    'the payment hint is a public site text in Arabic and French, got ' || v_found;

  assert (select s.value #>> '{}' from public.settings s where s.key = 'start.payment_hint') like '%يتحوّل الإدخار%',
    'the Arabic line says what the monthly amount turns into';
  assert (select s.value #>> '{}' from public.settings s where s.key = 'start.payment_hint_fr') like '%épargne%',
    'the French twin says the same thing';
end $$;

-- 2 · The keys the v3 calculator left behind stay, and say they are unused --------------------------
do $$
declare
  v_dead text[] := array['start.capacity_title', 'start.capacity_hint',
                         'start.capacity_title_fr', 'start.capacity_hint_fr'];
  v_found bigint;
begin
  -- 005 asserts these four exist and are public, so they are marked rather than removed.
  select count(*) into v_found from public.settings s where s.key = any (v_dead) and s.is_public;
  assert v_found = cardinality(v_dead), 'the retired capacity keys are still there for 005, got ' || v_found;

  select count(*) into v_found from public.settings s
  where s.key = any (v_dead) and s.description_ar like 'غير مستعمل حالياً%';
  assert v_found = cardinality(v_dead),
    'each retired key tells the Back Office it renders nowhere, got ' || v_found;
end $$;

-- 3 · The §53 vocabulary guard still passes ---------------------------------------------------------
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
  assert v_hits is null, 'the new line uses a phrase §53 forbids: ' || coalesce(v_hits, '');
end $$;

-- 4 · A visitor reads it, because the calculator is a public page -----------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'start.payment_hint%') = 2,
    'visitors read the payment hint in both languages';
end $$;

reset role;
