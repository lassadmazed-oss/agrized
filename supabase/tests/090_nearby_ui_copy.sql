-- 0143 · the distance line's words.

do $$
declare
  v_keys text[] := array['ui.nearby.ask','ui.nearby.result','ui.nearby.denied','ui.nearby.failed'];
  v_key  text;
begin
  foreach v_key in array v_keys loop
    assert exists (
      select 1 from public.settings s
      where s.key = v_key and s.value_type = 'text' and s.group_key = 'ui' and s.is_public
    ), format('%s is public ui copy the app can read', v_key);

    assert (select count(*) from public.translations t
             where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value') = 4,
      format('%s carries the four translations', v_key);
  end loop;
end $$;

-- The result line is the only one with a blank, and the app fills exactly one name. A row that lost it would
-- print a sentence with no number in it; a row that invented another would print «{miles}» to a customer.
do $$
declare
  v_ar text := (select s.value #>> '{}' from public.settings s where s.key = 'ui.nearby.result');
  v_row record;
begin
  assert v_ar like '%{km}%', 'the Arabic result line has the {km} blank';

  for v_row in
    select t.locale, t.value #>> '{}' as text
      from public.translations t
     where t.entity = 'setting' and t.entity_key = 'ui.nearby.result' and t.field = 'value'
  loop
    assert v_row.text like '%{km}%',
      format('the %s result line kept the {km} blank', v_row.locale);

    -- Any other brace pair is a blank nothing fills, and it reaches the screen verbatim.
    assert (select count(*) from regexp_matches(v_row.text, '\{[a-z_]+\}', 'g')) = 1,
      format('the %s result line has exactly one blank', v_row.locale);
  end loop;
end $$;
