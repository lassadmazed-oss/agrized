-- 0156 · three buttons that exist in five languages, and a reference line that has somewhere to put the number.
do $$
declare
  v_key    text;
  v_locale text;
  v_saved  text;
begin
  foreach v_key in array array['ui.study.download', 'ui.study.interest', 'ui.study.visit',
                               'ui.study.saved', 'ui.study.save_failed'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public),
      format('%s is missing, or is not published to the site', v_key);

    -- Every one of them is a label a reader taps. A label that falls back to Arabic on the Italian site is
    -- a button nobody there can use, and this page is nothing but buttons and figures.
    foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
      assert exists (select 1 from public.translations t
                      where t.entity = 'setting' and t.entity_key = v_key
                        and t.field = 'value' and t.locale = v_locale),
        format('%s was never translated into %s', v_key, v_locale);
    end loop;
  end loop;

  -- THE REFERENCE LINE MUST HAVE A HOLE FOR THE NUMBER. Without {ref} the sentence says «your study is
  -- saved» and never says under what — and the number is the whole reason it is saved: it is what a client
  -- reads down the phone so a commercial opens the same figures.
  select s.value #>> '{}' into v_saved from public.settings s where s.key = 'ui.study.saved';
  assert v_saved like '%{ref}%',
    'ui.study.saved has no {ref} placeholder, so the reference number has nowhere to appear';

  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    assert (select t.value #>> '{}' from public.translations t
             where t.entity = 'setting' and t.entity_key = 'ui.study.saved'
               and t.field = 'value' and t.locale = v_locale) like '%{ref}%',
      format('the %s reference line lost its {ref} placeholder in translation', v_locale);
  end loop;

  -- The two doors the buttons lead to are still there: a study that offers «سجّل اهتمامك» and «احجز زيارة»
  -- while neither module exists is three buttons, two of which are a dead end.
  assert exists (select 1 from public.feature_flags f where f.key = 'interest_form'),
    'the interest module is gone, so «سجّل اهتمامك بالمشروع» leads nowhere';
  assert exists (select 1 from public.feature_flags f where f.key = 'visits'),
    'the visits module is gone, so «احجز زيارة للأرض» leads nowhere';

  -- And the study can still be saved, which is what all three press first.
  assert exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'save_study'),
    'public.save_study is gone, so no button can record what the reader was shown';

  raise notice 'study actions: three buttons in five languages, and a reference line with somewhere to put the number';
end $$;
