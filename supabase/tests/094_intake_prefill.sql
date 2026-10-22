-- 0147 · a buyer reaches his own details and nobody else's, and never an answer he would be refused for.
--
-- The door is the thing being proved here, more than the payload: this function hands back a name, a phone
-- number and an e-mail address, so «one session, one person» has to be structural and not a habit.
do $$
declare
  v_mine    uuid;
  v_other   uuid;
  v_uid     uuid;
  v_time    uuid;
  v_gone    uuid;
  v_out     jsonb;
  v_ok      boolean;
begin
  -- A person with an auth user behind them is what a signed-in buyer IS; without one there is nothing here
  -- to prove, and this database may be a fresh one.
  select p.id, p.profile_id into v_mine, v_uid
  from public.persons p
  where p.profile_id is not null and p.archived_at is null
  order by p.created_at
  limit 1;
  if v_mine is null then
    raise notice 'no buyer has ever signed in here; nothing to prove';
    return;
  end if;
  select p.id into v_other from public.persons p where p.id <> v_mine and p.archived_at is null limit 1;

  -- ── the door ──────────────────────────────────────────────────────────────────────────────────────────
  -- 1 · A visitor gets nothing at all. The GRANT is the boundary, so this is Postgres refusing before the
  --     body runs — the same thing the screen must handle as «not signed in».
  assert not has_function_privilege('anon', 'public.my_intake_prefill()', 'execute'),
    'a visitor can read a buyer''s name, phone and e-mail';
  assert has_function_privilege('authenticated', 'public.my_intake_prefill()', 'execute'),
    'a signed-in buyer cannot read his own details';

  -- 2 · There is NOWHERE to put another person's id: the function takes no argument. Asserted against the
  --     catalogue rather than described, because an argument added in a later edit is exactly the mistake
  --     this shape exists to prevent.
  assert (select p.pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'my_intake_prefill') = 0,
    'my_intake_prefill grew an argument: a client session can now ask for somebody else''s details';

  -- 3 · Signed in as nobody is refused, not answered with an empty object.
  perform set_config('request.jwt.claims', null, true);
  begin
    perform public.my_intake_prefill();
    raise exception 'a session with no user was answered';
  exception when others then
    if sqlerrm <> 'not_signed_in' then
      raise exception 'expected not_signed_in, got "%"', sqlerrm;
    end if;
  end;

  -- 4 · A valid session that belongs to no person is refused too, rather than handed somebody's row.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
  begin
    perform public.my_intake_prefill();
    raise exception 'a session with no person behind it was answered';
  exception when others then
    if sqlerrm <> 'no_file' then
      raise exception 'expected no_file, got "%"', sqlerrm;
    end if;
  end;

  -- ── the payload ───────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_out := public.my_intake_prefill();

  -- 5 · It is HIS row, named by id, so a future edit that widened the lookup would be caught here.
  assert (v_out->>'person_id')::uuid = v_mine,
    'the prefill came back for a different person than the session''s';
  assert (v_out->>'full_name') is not distinct from (select p.full_name from public.persons p where p.id = v_mine),
    'the name is not the name on the buyer''s own row';
  assert (v_out->>'phone_e164') is not distinct from (select p.phone_e164 from public.persons p where p.id = v_mine),
    'the phone number is not the one on the buyer''s own row';

  -- 6 · It reads and never writes: a prefill that touched the person row would rewrite a CRM record every
  --     time a form was opened.
  assert (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'my_intake_prefill') = 's',
    'my_intake_prefill is no longer stable, so it may be writing';

  -- 7 · The count is his own requests and not everybody's — the figure the screen turns into «مع اللي
  --     بعثتهم قبل», which would be a lie about strangers' demands if the filter were dropped.
  assert (v_out->>'requests')::integer
         = (select count(*) from public.interest_requests r where r.person_id = v_mine),
    'the request count is not this buyer''s own';
  if v_other is not null then
    assert (v_out->>'requests')::integer
           <= (select count(*) from public.interest_requests r where r.person_id in (v_mine, v_other)),
      'the count reaches past this buyer';
  end if;

  -- ── the one answer it must never hand back ────────────────────────────────────────────────────────────
  -- 8 · A contact time the owner has since retired. The intake refuses it (invalid_time_choice), so a form
  --     pre-filled with it is worse than an empty one: the buyer answers every question and is then told no.
  insert into public.option_items (list_key, code, label_ar, label_fr, sort_order, is_active)
  values ('contact_time', 'test_time_gone', 'وقت بطّلناه', 'Créneau retiré', 9201, true)
  returning id into v_gone;

  update public.interest_requests set contact_time_option_id = v_gone
   where id = (select r.id from public.interest_requests r where r.person_id = v_mine
                order by r.created_at desc, r.id desc limit 1);

  if exists (select 1 from public.interest_requests r where r.person_id = v_mine) then
    v_out := public.my_intake_prefill();
    assert (v_out->>'contact_time_option_id')::uuid = v_gone, 'an offered contact time was not returned';

    update public.option_items set is_active = false where id = v_gone;
    v_out := public.my_intake_prefill();
    assert v_out->'contact_time_option_id' = 'null'::jsonb,
      'a retired contact time was handed to the form, which the intake would then refuse';
  end if;

  raise notice 'intake prefill: one session reaches one person, reads only, and never returns a choice that would be refused';
end $$;
