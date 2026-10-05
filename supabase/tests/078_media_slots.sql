-- 0128 · the owner can add a picture slot and take it back out, and cannot take out one the site renders.
do $$
declare
  v_admin uuid;
  v_row   public.site_media;
  v_slot  text;
  v_other public.site_media;
  v_ok    boolean;
  v_before integer;
begin
  select ur.user_id into v_admin
    from public.user_roles ur
   where ur.role in ('admin', 'super_admin')
   limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into v_before from public.site_media;

  -- 1 · A slot is created, marked custom, and given an ASCII key whatever the label says.
  v_row := public.staff_create_media_slot('صورة الحصاد', 'صورة من موسم الجني.', '16/9');
  assert v_row.slot ~ '^custom\.\d+$', format('the generated key is not ASCII-safe: %s', v_row.slot);
  assert v_row.is_custom, 'a slot the owner added is not marked custom';
  assert v_row.label_ar = 'صورة الحصاد', 'the label was not kept';
  assert v_row.aspect = '16/9', 'the aspect was not kept';
  assert v_row.url is null, 'a new slot must start empty';
  assert (select count(*) from public.site_media) = v_before + 1, 'the slot was not inserted';
  v_slot := v_row.slot;

  -- 2 · Two in a row do not collide.
  v_other := public.staff_create_media_slot('صورة ثانية');
  assert v_other.slot <> v_slot, 'two slots got the same key';

  -- 3 · A label that says nothing is refused, and so is an aspect the table would not accept.
  v_ok := true;
  begin
    perform public.staff_create_media_slot(' ');
  exception when others then v_ok := false;
  end;
  assert not v_ok, 'a slot with no name was accepted';

  v_ok := true;
  begin
    perform public.staff_create_media_slot('اسم', null, '5/4');
  exception when others then v_ok := false;
  end;
  assert not v_ok, 'an aspect outside the table''s own list was accepted';

  -- 4 · A seeded slot may NOT be deleted: the site renders it by name.
  if exists (select 1 from public.site_media m where m.slot = 'home.hero') then
    v_ok := true;
    begin
      perform public.staff_delete_media_slot('home.hero');
    exception when others then v_ok := false;
    end;
    assert not v_ok, 'home.hero was deleted — the home page renders it by name';
    assert exists (select 1 from public.site_media m where m.slot = 'home.hero'), 'home.hero is gone';
  end if;

  -- 5 · The owner's own slot goes.
  perform public.staff_delete_media_slot(v_slot);
  assert not exists (select 1 from public.site_media m where m.slot = v_slot), 'the custom slot was not deleted';

  -- 6 · Deleting the last picture out of the sliding cover is refused: the page would open on a blank frame.
  v_row := public.staff_create_media_slot('غلاف وحيد');
  update public.site_media set url = 'https://example.test/a.jpg', alt_ar = 'وصف', in_cover = true where slot = v_row.slot;
  update public.site_media set in_cover = false where slot <> v_row.slot;
  v_ok := true;
  begin
    perform public.staff_delete_media_slot(v_row.slot);
  exception when others then v_ok := false;
  end;
  assert not v_ok, 'the last picture in the slider was deleted — the home page would open on nothing';

  -- 7 · Nobody but an admin gets near either of them.
  assert not has_function_privilege('anon', 'public.staff_create_media_slot(text, text, text)', 'execute'),
    'anon can create picture slots';
  assert not has_function_privilege('anon', 'public.staff_delete_media_slot(text)', 'execute'),
    'anon can delete picture slots';

  raise notice 'media slots: created, named safely, built-ins protected, cover kept from emptying';
end $$;
