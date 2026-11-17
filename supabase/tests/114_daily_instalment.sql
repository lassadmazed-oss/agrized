-- 0168 · «التقسيط بلغة النهار»: the monthly instalment said per day, with words and numbers the owner edits.

do $$
declare
  v_key text;
begin
  assert (select (value #>> '{}')::integer from public.settings where key = 'start.per_day_days') > 0, 'a month has days';
  assert (select (value #>> '{}')::integer from public.settings where key = 'start.per_day_step') > 0, 'the rounding has a step';
  assert (select (value #>> '{}')::integer from public.settings where key = 'start.per_day_compare_price') > 0, 'a coffee has a price';
  assert (select (value #>> '{}')::integer from public.settings where key = 'start.per_day_compare_max') >= 0, 'the cap is a count';

  foreach v_key in array array['start.per_day_exact', 'start.per_day_less', 'start.per_day_exact_fr', 'start.per_day_less_fr'] loop
    assert (select value #>> '{}' from public.settings where key = v_key and is_public) like '%{amount}%',
      v_key || ' says the amount';
  end loop;
  assert (select value #>> '{}' from public.settings where key = 'start.per_day_compare') like '%{count, plural,%',
    'the comparison counts its coffees';

  -- «أقل من» is the rounded-up amount: the line never says less than it is, and never promises anything.
  assert (select value #>> '{}' from public.settings where key = 'start.per_day_less') like 'أقل من%', 'it says «less than»';
  assert not exists (select 1 from public.settings where key like 'start.per_day_%' and value::text ~ '(ربح|مضمون|gain|profit)'),
    'no line speaks of gain';

  -- Every other site has the three sentences.
  assert (select count(*) from public.translations
          where entity = 'setting' and entity_key in ('start.per_day_exact', 'start.per_day_less', 'start.per_day_compare')
            and locale in ('fr', 'de', 'it', 'en')) = 12, 'four languages, three sentences each';
end $$;
