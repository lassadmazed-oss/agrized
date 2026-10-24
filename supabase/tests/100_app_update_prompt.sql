-- 0153 · the update notice is configurable, readable by the app, and cannot contradict itself.
-- It asserts shape and invariants, never the owner's current numbers: those change with every release.
do $$
declare
  v_key      text;
  v_locale   text;
  v_platform text;
  v_latest   integer;
  v_min      integer;
  v_url      text;
begin
  foreach v_platform in array array['android', 'ios'] loop
    -- 1 · The three rows of each platform exist, are published to the app, and are the right kind of value.
    foreach v_key in array array['app.' || v_platform || '.latest_build', 'app.' || v_platform || '.min_build'] loop
      assert exists (select 1 from public.settings s
                      where s.key = v_key and s.is_public and s.value_type = 'integer'
                        and jsonb_typeof(s.value) = 'number'),
        format('%s is missing, not public, or not an integer: the app could not read it', v_key);
    end loop;
    assert exists (select 1 from public.settings s
                    where s.key = 'app.' || v_platform || '.store_url' and s.is_public
                      and s.value_type = 'text' and jsonb_typeof(s.value) = 'string'),
      format('app.%s.store_url is missing or not public text', v_platform);

    -- 2 · No negative numbers, and the floor never sits above the newest build: otherwise nobody could ever
    --     satisfy the forced update and the app would be closed for good. 0 means «not set».
    select (s.value #>> '{}')::integer into v_latest from public.settings s where s.key = 'app.' || v_platform || '.latest_build';
    select (s.value #>> '{}')::integer into v_min    from public.settings s where s.key = 'app.' || v_platform || '.min_build';
    assert v_latest >= 0 and v_min >= 0, format('%s has a negative build number', v_platform);
    assert v_latest = 0 or v_min <= v_latest,
      format('%s: min_build %s is above latest_build %s, so no build could satisfy the forced update', v_platform, v_min, v_latest);
  end loop;

  -- 3 · The Android address is the store page of THIS app, so «حدّث توّا» can never open somebody else's.
  select s.value #>> '{}' into v_url from public.settings s where s.key = 'app.android.store_url';
  assert v_url like 'https://play.google.com/store/apps/details?id=%', 'the Android store address is not a Play Store page';
  assert v_url like '%id=site.agrized.app%', 'the Android store address does not name the AgriZed package';

  -- 4 · The five sentences, in Arabic and in the four other languages. A missing one falls back to Arabic,
  --     which on the English site is a button whose label the reader cannot read.
  foreach v_key in array array['ui.app_update.title', 'ui.app_update.text', 'ui.app_update.text_required',
                               'ui.app_update.cta', 'ui.app_update.later'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public),
      format('%s is missing, or is not published to the app', v_key);
    assert length(trim(both from (select s.value #>> '{}' from public.settings s where s.key = v_key))) > 0,
      format('%s is empty', v_key);
    foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
      assert exists (
        select 1 from public.translations t
         where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_locale),
        format('%s was never translated into %s', v_key, v_locale);
    end loop;
  end loop;

  raise notice 'app update prompt: six settings per the two platforms, five sentences in five languages, no contradictions';
end $$;
