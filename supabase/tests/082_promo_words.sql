-- 0134 · the discount lines can be named in all five languages, and the badge keeps its placeholder.
do $$
declare
  v_key text;
  v_loc text;
  v_txt text;
begin
  foreach v_key in array array['ui.promo.before', 'ui.promo.discount', 'ui.promo.badge'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public and s.group_key = 'ui'),
      format('%s is missing, not public, or not in the ui group', v_key);

    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      select t.value #>> '{}' into v_txt
        from public.translations t
       where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_loc;
      assert v_txt is not null and v_txt <> '', format('%s has no %s translation', v_key, v_loc);

      -- A badge that loses {percent} prints «Remise %» to a reader, which says nothing.
      if v_key = 'ui.promo.badge' then
        assert v_txt like '%{percent}%', format('the %s badge lost {percent}: %s', v_loc, v_txt);
      end if;
    end loop;
  end loop;

  select s.value #>> '{}' into v_txt from public.settings s where s.key = 'ui.promo.badge';
  assert v_txt like '%{percent}%', format('the Arabic badge lost {percent}: %s', v_txt);

  raise notice 'promotion words: 3 keys, 4 translations each, the badge keeps its placeholder';
end $$;
