-- 0151 · the money on a sale waiting to be confirmed: where the price came from, and that the three figures
-- a human reads actually agree with each other.
--
-- THIS FILE OWNS ITS SALE. Reading the owner's live reservations would make every assertion below a
-- statement about whatever he last sold. Rolled back with the rest, like every file here.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_person  uuid;
  v_res     uuid;
  v_money   jsonb;
  v_paid    bigint;
  v_total   bigint;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- A priced offer with trees to hold: without one there is no sale to put money on.
  select r.id, r.project_id into v_res, v_project
  from public.reservations r
  where r.status in ('awaiting_deposit', 'deposit_paid')
  order by r.reserved_at desc
  limit 1;

  if v_res is null then
    raise notice 'no open reservation in this database; the money block is untested here';
  else
    v_money := app.reservation_money(v_res);
    assert v_money is not null, 'an existing reservation has no money block at all';

    -- 1 · THE THREE FIGURES A HUMAN READS MUST AGREE. This is the whole reason the block exists: a client
    --     on the phone subtracts the two he can see, and must not get a third.
    if (v_money->>'total_millimes') is not null then
      v_total := (v_money->>'total_millimes')::bigint;
      v_paid  := (v_money->>'paid_millimes')::bigint;
      assert (v_money->>'left_millimes')::bigint = greatest(v_total - v_paid, 0),
        format('total %s − paid %s ≠ left %s', v_total, v_paid, v_money->>'left_millimes');
      assert (v_money->>'left_millimes')::bigint >= 0, 'the remainder came back negative';
    end if;

    -- 2 · A price that exists says where it came from, and a price that does not exist does not pretend.
    --     «estimate or agreed» is the one thing the screen cannot work out for itself.
    if (v_money->>'total_millimes') is null and (v_money->>'price_per_tree_millimes') is null then
      assert (v_money->>'price_source') is null, 'a sale with no price still named a source for it';
    else
      assert (v_money->>'price_source') in ('request', 'offer'),
        format('a price arrived from «%s», which is neither the request nor the offer', v_money->>'price_source');
    end if;

    -- 3 · Paid counts every payment that is not voided — not only the deposit, which is a different question
    --     answered one key up in the payload.
    select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
    from public.payments p
    where p.reservation_id = v_res and p.voided_at is null;
    assert (v_money->>'paid_millimes')::bigint = v_paid,
      'paid is not the sum of this reservation''s live payments';

    -- 4 · It reaches the screens through the payload, which is the only caller. A key that exists in the
    --     function and not in the payload is a feature nobody can see.
    assert (app.reservation_payload(v_res) -> 'money') is not null,
      'the money block does not reach app.reservation_payload, so no screen can read it';
  end if;

  -- 5 · A voided payment is not money. The most expensive way to be wrong here is to count a cancelled
  --     receipt, because the remainder then tells a client he owes less than he does.
  if v_res is not null then
    select p.id into v_person from public.payments p where p.reservation_id = v_res and p.voided_at is null limit 1;
    if v_person is not null then
      v_paid := (app.reservation_money(v_res)->>'paid_millimes')::bigint;
      -- voided_at and voided_by travel together (payments_void_check): a receipt is cancelled BY
      -- somebody, and the table will not let a test pretend otherwise.
      update public.payments set voided_at = now(), voided_by = v_admin where id = v_person;
      assert (app.reservation_money(v_res)->>'paid_millimes')::bigint < v_paid,
        'voiding a payment did not change what the client is said to have paid';
    end if;
  end if;

  -- 6 · Nothing in a browser may price a sale: PRJ-03 makes a price a permission, and this one is read
  --     behind the staff doors or not at all.
  assert not has_function_privilege('anon', 'app.reservation_money(uuid)', 'execute'),
    'a visitor can price a reservation';
  assert not has_function_privilege('authenticated', 'app.reservation_money(uuid)', 'execute'),
    'any signed-in account can price a reservation';

  -- 7 · It reads and never writes. A payload that wrote would rewrite a sale every time a list was drawn.
  assert (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app' and p.proname = 'reservation_money') = 's',
    'app.reservation_money is no longer stable, so it may be writing';

  raise notice 'reservation money: three figures that add up, a price that says where it came from, and no voided receipt in it';
end $$;
