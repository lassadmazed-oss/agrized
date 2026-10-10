-- 0136 · Parrainage: the chain, the six generations, and a commission that follows its sale.
--
-- The owner's own example (spec §3): A → B → C → D → E → F → G. G buys; F earns 100, E 40, D 25, C 15, B 10,
-- A 10 — per tree — and nothing exists until a real sale does. Then the sale is paid, unpaid, paid again, one
-- commission is paid out, and the sale is cancelled: what was paid is «reversed», the rest «cancelled».

-- The test owns the switches it depends on; the runner rolls everything back.
update public.settings set value = to_jsonb('never'::text) where key = 'legal.require_open_file_at';
update public.feature_flags set state = 'internal' where key = 'referrals';
insert into public.commission_rules (amounts_millimes, basis, cap_millimes, min_margin_bp, note)
values (array[100000, 40000, 25000, 15000, 10000, 10000]::bigint[], 'tree', 200000, 1500, 'test 083');

do $$
declare
  v_status  uuid := (select id from public.lead_statuses order by sort_order limit 1);
  v_people  uuid[] := '{}';
  v_id      uuid;
  v_code    text;
  v_old     uuid;
  v_project uuid;
  v_cost    bigint;
  v_price   bigint;
  v_res     uuid;
  v_ctr     uuid;
  v_n       integer;
  v_ok      boolean;
  v_out     text;
  v_admin   uuid;
  v_pay     jsonb;
  v_row     public.commission_transactions;
  v_rule    public.commission_rules;
begin
  -- ── seven people, A … G, each brought by the one before ─────────────────────────────────────────────────
  for i in 1 .. 7 loop
    insert into public.persons (full_name, phone_e164, status_id, governorate_id)
    values ('اختبار التوصية ' || chr(64 + i), '+21699' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'),
            v_status, 34)
    returning id into v_id;
    v_people := v_people || v_id;
    if i > 1 then
      v_code := app.ensure_referral_code(v_people[i - 1]);
      assert v_code ~ '^[2-9A-HJKMNP-Z]{6}$', 'a code is six characters from the unambiguous alphabet: ' || v_code;
      assert app.ensure_referral_code(v_people[i - 1]) = v_code, 'a code, once made, does not change';
      v_out := app.attach_referral(v_id, lower(v_code), jsonb_build_object('ip', 'h1'));
      assert v_out = 'attached', 'a new person is attached by their parrain''s code (any case), got ' || v_out;
    end if;
  end loop;
  assert (select referred_by from public.persons where id = v_people[7]) = v_people[6], 'G was brought by F';
  assert (select referred_at from public.persons where id = v_people[7]) is not null, 'the referral is dated';

  -- ── §4A: the relation is fixed ───────────────────────────────────────────────────────────────────────────
  v_out := app.attach_referral(v_people[7], app.ensure_referral_code(v_people[1]), null);
  assert v_out = 'already_referred', 'a second link does not move a referral, got ' || v_out;
  v_ok := true;
  begin
    update public.persons set referred_by = v_people[1] where id = v_people[7];
  exception when others then
    v_ok := false;
    assert sqlerrm = 'referrer_locked', 'a direct update is refused by name, got ' || sqlerrm;
  end;
  assert not v_ok, 'nobody moves a referral with a plain UPDATE';
  v_ok := true;
  begin
    update public.persons set referral_code = 'ABCDEF' where id = v_people[7];
  exception when others then
    v_ok := false;
  end;
  assert not v_ok, 'nobody types a code by hand';

  -- §8.3: no cycle, no self-referral, even for a writer allowed to move it
  perform set_config('app.referral_write', 'on', true);
  v_ok := true;
  begin
    update public.persons set referred_by = v_people[7] where id = v_people[1];
  exception when others then
    v_ok := false;
    assert sqlerrm = 'referral_cycle', 'a cycle is refused by name, got ' || sqlerrm;
  end;
  assert not v_ok, 'A cannot be brought by G, who descends from A';
  v_ok := true;
  begin
    update public.persons set referred_by = v_people[1] where id = v_people[1];
  exception when others then
    v_ok := false;
  end;
  assert not v_ok, 'nobody is their own parrain';
  perform set_config('app.referral_write', 'off', true);

  -- An existing person keeps their history; an unknown or malformed code attaches nothing.
  insert into public.persons (full_name, phone_e164, status_id, governorate_id, created_at)
  values ('حريف قديم', '+21698' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34,
          now() - interval '3 days')
  returning id into v_old;
  assert app.attach_referral(v_old, app.ensure_referral_code(v_people[1]), null) = 'existing_person',
    'a person who registered before the link is not attached';
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف جديد', '+21697' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_id;
  assert app.attach_referral(v_id, 'ZZZZZZ', null) = 'unknown_code', 'an unknown code attaches nothing';
  assert app.attach_referral(v_id, 'a-0!', null) = 'invalid_code', 'a malformed code attaches nothing';

  -- The upline, nearest first
  assert (select array_agg(u.person_id order by u.generation) from app.referral_upline(v_people[7], 6) u)
         = array[v_people[6], v_people[5], v_people[4], v_people[3], v_people[2], v_people[1]],
    'G''s six generations are F, E, D, C, B, A';
  assert (select count(*) from app.referral_upline(v_people[7], 2)) = 2, 'the depth is respected';

  -- ── §4B: a sale creates the commissions, Pending ─────────────────────────────────────────────────────────
  insert into public.projects (code, name, governorate_id) values ('REF-T-' || substr(md5(random()::text), 1, 6), 'عرض اختبار التوصية', 34)
  returning id into v_project;
  v_cost  := app.referral_cost_per_tree(v_project, null);
  -- A price well above cost, so the margin leaves the whole cap; a known cost is checked further down.
  v_price := greatest(coalesce(v_cost, 0) * 2, 2000000);
  perform set_config('test.ref_project', v_project::text, true);

  insert into public.reservations (reference_no, person_id, project_id, trees_count, deposit_due_millimes, valid_days)
  values ('REF-RES-' || substr(md5(random()::text), 1, 8), v_people[7], v_project, 3, 0, 0) returning id into v_res;
  insert into public.contracts (reference_no, reservation_id, person_id, project_id, trees_count, payment_mode,
                                price_per_tree_millimes, total_price_millimes, down_payment_millimes)
  values ('REF-CTR-' || substr(md5(random()::text), 1, 8), v_res, v_people[7], v_project, 3, 'cash',
          v_price, v_price * 3, v_price * 3)
  returning id into v_ctr;

  assert (select count(*) from public.commission_transactions where contract_id = v_ctr) = 6, 'six generations, six rows';
  assert (select array_agg(t.beneficiary_person_id order by t.generation) from public.commission_transactions t where t.contract_id = v_ctr)
         = array[v_people[6], v_people[5], v_people[4], v_people[3], v_people[2], v_people[1]], 'F first, A last';
  assert (select array_agg(t.amount_millimes order by t.generation) from public.commission_transactions t where t.contract_id = v_ctr)
         = array[300000, 120000, 75000, 45000, 30000, 30000]::bigint[], 'the owner''s amounts, times three trees';
  assert (select sum(amount_millimes) from public.commission_transactions where contract_id = v_ctr) = 600000,
    '200 per tree, three trees';
  assert not exists (select 1 from public.commission_transactions where contract_id = v_ctr and status <> 'pending'),
    'nothing is owed before the sale is paid';
  assert app.referral_create_commissions(v_ctr) = 0, 'the same sale is never counted twice';

  -- §8.5: a new rule does not touch this sale
  select * into v_rule from public.commission_rules order by version desc limit 1;
  assert (select bool_and(rule_id = v_rule.id) from public.commission_transactions where contract_id = v_ctr),
    'each row names the rule it was computed from';

  -- ── §4C: fully paid → Validated; a voided receipt → Pending again ────────────────────────────────────────
  update public.contracts set status = 'signed', signed_on = current_date where id = v_ctr;
  update public.contracts set status = 'completed', settled_at = now() where id = v_ctr;
  assert not exists (select 1 from public.commission_transactions where contract_id = v_ctr and status <> 'validated'),
    'a sale paid in full validates its commissions';
  update public.contracts set status = 'signed', settled_at = null where id = v_ctr;
  assert not exists (select 1 from public.commission_transactions where contract_id = v_ctr and status <> 'pending'),
    'a sale back below fully paid owes nothing again';
  update public.contracts set status = 'completed', settled_at = now() where id = v_ctr;

  -- ── payouts and cancellation need a Finance or Admin session ─────────────────────────────────────────────
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; payouts are not exercised';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select * into v_row from public.commission_transactions where contract_id = v_ctr and generation = 1;

    v_ok := true;
    begin
      perform public.staff_pay_commissions(v_people[5], array[v_row.id], current_date, 'نقدًا', null, 'خلاص تجربة');
    exception when others then
      v_ok := false;
      assert sqlerrm = 'commission_not_payable', 'paying somebody else''s commission is refused, got ' || sqlerrm;
    end;
    assert not v_ok, 'E cannot be paid F''s commission';

    v_pay := public.staff_pay_commissions(v_people[6], array[v_row.id], current_date, 'نقدًا', 'REC-1', 'خلاص تجربة');
    assert (v_pay->>'total_millimes')::bigint = 300000, 'the payout carries the commission''s amount';
    assert (select status from public.commission_transactions where id = v_row.id) = 'paid', 'F is paid';

    v_ok := true;
    begin
      perform public.staff_pay_commissions(v_people[6], array[v_row.id], current_date, null, null, 'مرّة ثانية');
    exception when others then
      v_ok := false;
    end;
    assert not v_ok, 'a commission is paid once';

    -- A human stops one that is not paid yet, with a reason.
    select * into v_row from public.commission_transactions where contract_id = v_ctr and generation = 6;
    perform public.staff_cancel_commission(v_row.id, 'حساب مكرّر');
    assert (select status from public.commission_transactions where id = v_row.id) = 'cancelled', 'A''s is stopped';

    -- The rule editor refuses a total above the cap.
    v_ok := true;
    begin
      perform public.staff_save_commission_rule(jsonb_build_object(
        'amounts_millimes', jsonb_build_array(150000, 100000), 'basis', 'tree', 'cap_millimes', 200000,
        'min_margin_bp', 1500, 'reason', 'تجربة'));
    exception when others then
      v_ok := false;
      assert sqlerrm = 'commission_over_cap', 'over the cap is refused by name, got ' || sqlerrm;
    end;
    assert not v_ok, 'the generations never sum above the cap';

    -- The overview and the lists answer.
    assert (public.staff_referral_overview()->>'flag') = 'internal', 'the overview reads the module';
    assert (public.staff_referral_commissions(null, v_people[6], 50, 0)->>'total')::integer = 1, 'F has one commission';
    assert jsonb_array_length(public.staff_referral_tree(v_people[1])->'downline') = 6, 'A sees six generations below';
    assert jsonb_typeof(public.staff_referral_alerts()) = 'array', 'the alerts answer a list';
    perform set_config('request.jwt.claims', '', true);
  end if;

  -- ── cancelling the sale: paid → reversed, the rest → cancelled ───────────────────────────────────────────
  update public.contracts set status = 'cancelled', cancelled_at = now(), cancel_reason = 'إلغاء تجربة' where id = v_ctr;
  assert not exists (select 1 from public.commission_transactions
                     where contract_id = v_ctr and status not in ('cancelled', 'reversed')), 'nothing survives a cancelled sale';
  if v_admin is not null then
    assert (select status from public.commission_transactions where contract_id = v_ctr and generation = 1) = 'reversed',
      'a paid commission of a cancelled sale is to be recovered, not erased';
  end if;
  assert (select count(*) from public.commission_transactions where contract_id = v_ctr) = 6, 'history is kept';

  -- ── a short chain: only the generations that exist are paid, nothing is redistributed ────────────────────
  insert into public.reservations (reference_no, person_id, project_id, trees_count, deposit_due_millimes, valid_days)
  values ('REF-RES-' || substr(md5(random()::text), 1, 8), v_people[3], v_project, 1, 0, 0) returning id into v_res;
  insert into public.contracts (reference_no, reservation_id, person_id, project_id, trees_count, payment_mode,
                                price_per_tree_millimes, total_price_millimes, down_payment_millimes)
  values ('REF-CTR-' || substr(md5(random()::text), 1, 8), v_res, v_people[3], v_project, 1, 'cash',
          v_price, v_price, v_price)
  returning id into v_ctr;
  assert (select array_agg(t.amount_millimes order by t.generation) from public.commission_transactions t where t.contract_id = v_ctr)
         = array[100000, 40000]::bigint[], 'C''s purchase pays B and A only';

  -- ── the offer switch and the module switch ───────────────────────────────────────────────────────────────
  update public.projects set referral_enabled = false where id = v_project;
  insert into public.reservations (reference_no, person_id, project_id, trees_count, deposit_due_millimes, valid_days)
  values ('REF-RES-' || substr(md5(random()::text), 1, 8), v_people[7], v_project, 1, 0, 0) returning id into v_res;
  insert into public.contracts (reference_no, reservation_id, person_id, project_id, trees_count, payment_mode,
                                price_per_tree_millimes, total_price_millimes, down_payment_millimes)
  values ('REF-CTR-' || substr(md5(random()::text), 1, 8), v_res, v_people[7], v_project, 1, 'cash',
          v_price, v_price, v_price)
  returning id into v_ctr;
  assert not exists (select 1 from public.commission_transactions where contract_id = v_ctr), 'an offer switched off earns nothing';

  update public.projects set referral_enabled = true where id = v_project;
  update public.feature_flags set state = 'disabled' where key = 'referrals';
  insert into public.reservations (reference_no, person_id, project_id, trees_count, deposit_due_millimes, valid_days)
  values ('REF-RES-' || substr(md5(random()::text), 1, 8), v_people[7], v_project, 1, 0, 0) returning id into v_res;
  insert into public.contracts (reference_no, reservation_id, person_id, project_id, trees_count, payment_mode,
                                price_per_tree_millimes, total_price_millimes, down_payment_millimes)
  values ('REF-CTR-' || substr(md5(random()::text), 1, 8), v_res, v_people[7], v_project, 1, 'cash',
          v_price, v_price, v_price)
  returning id into v_ctr;
  assert not exists (select 1 from public.commission_transactions where contract_id = v_ctr), 'a closed module creates nothing';
  assert not public.referral_code_exists(app.ensure_referral_code(v_people[1])), 'a closed module knows no code';
  assert app.attach_referral(v_id, app.ensure_referral_code(v_people[1]), null) = 'closed', 'a closed module attaches nothing';
  update public.feature_flags set state = 'internal' where key = 'referrals';
  assert public.referral_code_exists(lower(app.ensure_referral_code(v_people[1]))), 'an open module knows the code';

  -- ── §8.4: AgriZed keeps its margin — only checkable when this database prices the offer ──────────────────
  if v_cost is not null and v_cost > 0 then
    -- Cost + 20 %: 15 % must stay, so 5 % of the cost is all the generations can share.
    v_price := v_cost + ceil(v_cost * 0.20)::bigint;
    insert into public.reservations (reference_no, person_id, project_id, trees_count, deposit_due_millimes, valid_days)
    values ('REF-RES-' || substr(md5(random()::text), 1, 8), v_people[7], v_project, 1, 0, 0) returning id into v_res;
    insert into public.contracts (reference_no, reservation_id, person_id, project_id, trees_count, payment_mode,
                                  price_per_tree_millimes, total_price_millimes, down_payment_millimes)
    values ('REF-CTR-' || substr(md5(random()::text), 1, 8), v_res, v_people[7], v_project, 1, 'cash',
            v_price, v_price, v_price)
    returning id into v_ctr;
    select coalesce(sum(amount_millimes), 0) into v_n from public.commission_transactions where contract_id = v_ctr;
    assert v_n <= least(200000, greatest(0, v_price - v_cost - ceil(v_cost * 0.15)::bigint)),
      'commissions never eat into the minimum margin';
    assert not exists (select 1 from public.commission_transactions t where t.contract_id = v_ctr and t.generation > 1
                       and exists (select 1 from public.commission_transactions u where u.contract_id = v_ctr
                                   and u.generation = t.generation - 1 and u.unit_millimes < u.rule_unit_millimes)),
      'a deeper generation is never paid while a nearer one was cut';
  else
    raise notice 'no cost rules for a fresh offer here; the margin cut is not exercised';
  end if;

  -- ── grants ───────────────────────────────────────────────────────────────────────────────────────────────
  assert has_function_privilege('anon', 'public.referral_code_exists(text)', 'execute'), 'the /ref route may ask for a code';
  assert not has_function_privilege('anon', 'public.my_referral()', 'execute'), 'anon has no referral page';
  assert not has_function_privilege('anon', 'public.staff_referral_overview()', 'execute'), 'anon has no Back Office';
  assert not has_function_privilege('anon', 'public.staff_pay_commissions(uuid, uuid[], date, text, text, text)', 'execute'),
    'anon pays nothing';
  assert not has_table_privilege('anon', 'public.commission_transactions', 'select'), 'anon reads no commission';
  assert (public.my_referral()->>'reason') = 'no_session', 'the client page needs a session';
end $$;
