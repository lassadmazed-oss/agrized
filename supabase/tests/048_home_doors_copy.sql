-- The home screen's four doors carry words the Back Office holds (0075).

do $$
declare
  v_keys text[] := array[
    'site.app_hero_cta', 'site.app_guide_cta',
    'site.app_guide_title', 'site.app_guide_note',
    'site.app_pick_title', 'site.app_pick_note'
  ];
  v_key text;
begin
  foreach v_key in array v_keys loop
    assert exists (
      select 1 from public.settings s
      where s.key = v_key and s.value_type = 'text' and s.group_key = 'site' and s.is_public
    ), format('%s is public site copy', v_key);

    assert coalesce((select s.value #>> '{}' from public.settings s where s.key = v_key), '') <> '',
      format('%s says something', v_key);
  end loop;

  -- The section was renamed to «عروضنا»; the button that opens it must not still say «المشاريع».
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.app_hero_cta') not like '%المشاريع%',
    'the offers button uses the word the offers section actually uses';

  -- The two cards sort the reader, so they must not be the same question twice.
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.app_guide_title')
       <> (select s.value #>> '{}' from public.settings s where s.key = 'site.app_pick_title'),
    'the two doors ask different questions';
end $$;

-- It is copy on the first screen a visitor sees, so a visitor must be able to read it.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'site.app_%') >= 6,
    'a visitor reads the home screen doors';
end $$;

reset role;
