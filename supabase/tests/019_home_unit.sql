-- Home page on the tree unit (docs/plan-zitouna.md P3-2). Migration 0033_home_unit.sql.

do $$
declare
  v_key text;
begin
  -- The copy exists, is public (the home page reads it with the anon key) and is not empty.
  foreach v_key in array array['site.unit_title', 'site.unit_text', 'site.unit_cta', 'site.unit_note'] loop
    assert exists (
      select 1 from public.settings s
      where s.key = v_key and s.is_public and s.value_type = 'text'
        and length(btrim(s.value #>> '{}')) > 0
    ), v_key || ' is seeded, public and not empty';
  end loop;

  -- PRN-01: the new copy promises nothing.
  assert not exists (
    select 1 from public.settings s
    where s.key like 'site.unit_%'
      and (s.value #>> '{}') ~ '(ربح|أرباح|مردود|مضمون|عائد)'
  ), 'the unit copy has no return or guarantee wording';

  -- The corrections leave no text that contradicts the tree unit.
  assert not exists (
    select 1 from public.settings s, jsonb_array_elements(s.value) e
    where s.key = 'site.facts' and jsonb_typeof(s.value) = 'array'
      and e ->> 'label' = 'الوحدة والمساحة تتحدّدان في كل مشروع حسب عدد الزيتونات'
  ), 'the old unit fact is gone';
  assert not exists (
    select 1 from public.settings s, jsonb_array_elements(s.value) e
    where s.key = 'site.faq' and jsonb_typeof(s.value) = 'array'
      and e ->> 'q' = 'هل تبيع AgriZed أراضي الآن؟'
  ), 'the FAQ no longer says AgriZed sells land';

  -- The removed «قطعة» cards leave no photo slot behind (nor its credit in the footer).
  assert not exists (select 1 from public.site_media where slot like 'home.parcel_%'),
    'the parcel example photo slots are gone';
end $$;

-- A visitor reads the copy through the public policy.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'site.unit_%') = 4, 'visitors can read the four unit texts';
end $$;

reset role;
