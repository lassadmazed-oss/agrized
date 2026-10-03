-- 0124 · the install card's words exist, are public, and are written in all five languages.
--
-- The card itself cannot be tested from here — whether it draws depends on the browser, not on the database.
-- What the database owes it is this: three keys the page can read on every render, visible to a visitor who is
-- not signed in, and a translation for each of the four languages beside Arabic. A missing one would not break
-- anything visibly; it would quietly show Arabic words inside a French page.
do $$
declare
  v_keys text[] := array['ui.install.title', 'ui.install.note', 'ui.install.cta'];
  v_key  text;
  v_loc  text;
begin
  foreach v_key in array v_keys loop
    assert exists (select 1 from public.settings s where s.key = v_key),
      format('%s is missing: the install card would render an empty string', v_key);

    assert (select s.is_public from public.settings s where s.key = v_key),
      format('%s is not public: the home page reads it for signed-out visitors', v_key);

    assert (select s.group_key from public.settings s where s.key = v_key) = 'ui',
      format('%s is not in the ui group, so it would not reach the Back Office''s texts screen', v_key);

    -- Arabic is the value on the row itself; the other four are translations of it.
    assert (select s.value from public.settings s where s.key = v_key) <> to_jsonb(''::text),
      format('%s is empty', v_key);

    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      assert exists (
        select 1 from public.translations t
         where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_loc
      ), format('%s has no %s translation: a %s page would show the Arabic', v_key, v_loc, v_loc);
    end loop;
  end loop;

  raise notice 'install card: 3 keys, public, ui group, 4 translations each';
end $$;
