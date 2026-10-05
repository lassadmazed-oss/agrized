-- 0127 · the home page's journey sections can say every one of their words, in all five languages.
--
-- Three things are worth proving here, and all three are mistakes that would ship silently:
--   · a scalar key with no translation prints Arabic inside a German page;
--   · a LIST whose translation is short prints nothing for the rows it is missing, and the section quietly
--     loses a step — this is the one that cannot be seen by reading the migration;
--   · a `key` or `icon` that got translated looks up no drawing at all, and the scene renders empty.
do $$
declare
  v_key   text;
  v_loc   text;
  v_text  text;
  v_ar    jsonb;
  v_src   text;
  v_tr    jsonb;
  v_lists text[] := array['site.journey_scenes', 'site.journey_steps', 'site.journey_trust', 'site.journey_example'];
  v_count int;
begin
  -- ── the four lists ───────────────────────────────────────────────────────────────────────────────────
  foreach v_key in array v_lists loop
    select s.value into v_ar from public.settings s where s.key = v_key and s.is_public and s.value_type = 'json';
    assert v_ar is not null, format('%s is missing, not public, or not json', v_key);
    assert jsonb_typeof(v_ar) = 'array', format('%s is not an array', v_key);
    assert jsonb_array_length(v_ar) > 0, format('%s is empty', v_key);

    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      select t.value into v_tr
        from public.translations t
       where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_loc;
      assert v_tr is not null, format('%s has no %s list', v_key, v_loc);

      assert jsonb_array_length(v_tr) = jsonb_array_length(v_ar),
        format('%s: the %s list has %s rows, Arabic has %s — the section would lose a step',
               v_key, v_loc, jsonb_array_length(v_tr), jsonb_array_length(v_ar));

      -- The keys must line up one for one, in order: they are what the code looks the drawing up by.
      select count(*) into v_count
        from jsonb_array_elements(v_ar) with ordinality a(row, i)
        join jsonb_array_elements(v_tr) with ordinality b(row, i) on a.i = b.i
       where a.row ->> 'key' is distinct from b.row ->> 'key';
      assert v_count = 0,
        format('%s: %s rows of the %s list carry a different `key` than the Arabic — a translated key draws nothing',
               v_key, v_count, v_loc);
    end loop;
  end loop;

  -- `icon` is a lookup too, and only the trust list has one.
  select count(*) into v_count
    from jsonb_array_elements((select s.value from public.settings s where s.key = 'site.journey_trust')) row
   where row ->> 'icon' is null;
  assert v_count = 0, format('%s rows of site.journey_trust have no icon', v_count);

  -- ── the scalar words ─────────────────────────────────────────────────────────────────────────────────
  for v_key in select s.key from public.settings s where s.key like 'ui.journey.%' loop
    assert (select s.is_public and s.group_key = 'ui' from public.settings s where s.key = v_key),
      format('%s is not public, or not in the ui group', v_key);

    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      select t.value #>> '{}' into v_text
        from public.translations t
       where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_loc;
      assert v_text is not null and v_text <> '', format('%s has no %s translation', v_key, v_loc);

      -- A placeholder lost in translation prints itself to the reader.
      select s.value #>> '{}' into v_src from public.settings s where s.key = v_key;
      if v_src like '%{count}%' then
        assert v_text like '%{count}%', format('the %s %s lost {count}: %s', v_loc, v_key, v_text);
      end if;
      if v_src like '%{step}%' then
        assert v_text like '%{step}%' and v_text like '%{total}%',
          format('the %s %s lost a placeholder: %s', v_loc, v_key, v_text);
      end if;
    end loop;
  end loop;

  raise notice 'journey: 4 lists aligned across 4 languages, every ui.journey.* translated';
end $$;
