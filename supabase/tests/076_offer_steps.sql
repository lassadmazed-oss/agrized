-- 0126 · the step-by-step offer form can name its own buttons, in every language.
--
-- The counter is the one worth testing beyond existence: it carries {step} and {total}, and a translation that
-- loses a placeholder does not fail — it prints «3/{total}» to a French reader and nobody notices until one does.
do $$
declare
  v_key  text;
  v_loc  text;
  v_text text;
begin
  foreach v_key in array array['ui.offer.form_next', 'ui.offer.form_back', 'ui.offer.form_step_of', 'ui.offer.form_progress_label'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public and s.group_key = 'ui'),
      format('%s is missing, not public, or not in the ui group', v_key);

    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      select t.value #>> '{}' into v_text
        from public.translations t
       where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_loc;
      assert v_text is not null, format('%s has no %s translation', v_key, v_loc);

      if v_key = 'ui.offer.form_step_of' then
        assert v_text like '%{step}%' and v_text like '%{total}%',
          format('the %s counter lost a placeholder: %s', v_loc, v_text);
      end if;
    end loop;
  end loop;

  -- Arabic is the row's own value, and it is the one the placeholders must survive in too.
  select s.value #>> '{}' into v_text from public.settings s where s.key = 'ui.offer.form_step_of';
  assert v_text like '%{step}%' and v_text like '%{total}%', format('the Arabic counter lost a placeholder: %s', v_text);

  raise notice 'offer form steps: 4 keys, 4 translations each, counter placeholders intact';
end $$;
