-- 0175 · «الميدان»: the administrator hands out people, the commercial books, visits, reports and takes a deposit.

do $$
declare
  v_admin   uuid;
  v_com     uuid;
  v_project uuid;
  v_a       uuid;
  v_b       uuid;
  v_c       uuid;
  v_req     uuid;
  v_date    date;
  v_visit   jsonb;
  v_visit_b jsonb;
  v_out     jsonb;
  v_board   jsonb;
  v_res     public.reservations;
  v_pay     public.payments;
  v_receipt jsonb;
  v_failed  boolean;
  v_status  uuid := (select id from public.lead_statuses order by sort_order limit 1);
begin
  -- ── the doors ───────────────────────────────────────────────────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.field_board(uuid)', 'execute'), 'a visitor reads no list';
  assert not has_function_privilege('anon', 'public.field_report(uuid, jsonb)', 'execute'), 'nor reports a visit';
  assert not has_function_privilege('anon', 'public.admin_field_assign(uuid[], uuid)', 'execute'), 'nor hands out people';
  assert app.setting('field.result_labels') ? 'deposit', 'the five words are settings';
  assert app.setting_int('reservations.valid_days_default', 0) <> 14, 'the hold is no longer 14 days by default';

  select ur.user_id into v_admin from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
   where ur.role in ('admin', 'super_admin') and pr.is_active limit 1;
  select ur.user_id into v_com from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
   where ur.role = 'commercial' and pr.is_active
     and not exists (select 1 from public.user_roles x where x.user_id = ur.user_id and x.role in ('admin', 'super_admin'))
   limit 1;
  if v_admin is null or v_com is null then
    raise notice 'no admin or no plain commercial here; the field flow is not exercised';
    return;
  end if;

  -- ── an offer with five trees, two people asking to visit, one who is not on any list ─────────────────────
  insert into public.projects (code, name, governorate_id, status)
  values ('FIELD-' || substr(md5(random()::text), 1, 6), 'عرض الميدان', 34, 'published') returning id into v_project;
  insert into public.trees (project_id, seq, code, state)
  select v_project, s, 'FIELD-T-' || s, 'available' from generate_series(1, 5) s;

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف الميدان', '+21696' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_a;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف ما جاش', '+21695' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_b;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف موش متاعو', '+21694' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_c;

  insert into public.interest_requests (request_no, person_id, full_name, phone_e164, residence_governorate_id,
                                        contact_channel, consent_text, project_id, offer_trees, wants_visit,
                                        request_kind, invest_anywhere, project_type_unsure)
  select 'FIELD-REQ-' || substr(md5(random()::text), 1, 8), p.id, p.full_name, p.phone_e164, 34, 'phone', 'موافق',
         v_project, 2, true, 'offer', true, true
    from public.persons p where p.id in (v_a, v_b);
  select r.id into v_req from public.interest_requests r where r.person_id = v_a;

  -- ── the administrator hands two of them to the commercial ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_out := public.admin_field_candidates();
  assert (v_out->'candidates') @> jsonb_build_array(jsonb_build_object('person', jsonb_build_object('id', v_a))),
    'someone asking to visit is a candidate';
  assert public.admin_field_assign(array[v_a, v_b], v_com) = 2, 'two people join the list';
  assert public.admin_field_assign(array[v_a], v_com) = 0, 'and only once';
  assert (select assigned_to from public.persons where id = v_a) = v_com, 'the file is now his';
  assert not ((public.admin_field_candidates()->'candidates') @> jsonb_build_array(jsonb_build_object('person', jsonb_build_object('id', v_a)))),
    'a listed person is no longer a candidate';

  -- ── the commercial: his list, the appointment ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
  v_board := public.field_board(v_admin);  -- a commercial cannot read somebody else's list by asking
  assert (v_board->'user'->>'id')::uuid = v_com, 'a commercial reads his own list';
  assert jsonb_array_length(v_board->'people') >= 2, 'his two people are there';
  assert (select x->>'step' from jsonb_array_elements(v_board->'people') x where x->'person'->>'id' = v_a::text) = 'call',
    'first, he calls';

  v_date := (app.visit_terms(null)->>'min_date')::date;
  while extract(isodow from v_date)::integer in (select x::integer from jsonb_array_elements_text(app.visit_terms(null)->'closed_weekdays') x) loop
    v_date := v_date + 1;
  end loop;

  v_visit := public.field_book(v_a, jsonb_build_object('project_id', v_project, 'request_id', v_req,
                                                       'visit_date', v_date, 'time', '09:30', 'people_count', 2));
  assert v_visit->>'status' = 'confirmed', 'the appointment is confirmed';
  assert v_visit->>'meeting_time' = '09:30', 'at the hour agreed';
  assert (v_visit->'assigned'->>'id')::uuid = v_com, 'and it is his';

  v_out := public.field_book(v_a, jsonb_build_object('project_id', v_project, 'visit_date', v_date, 'time', '14:00'));
  assert v_out->>'id' = v_visit->>'id', 'moving the hour moves the same visit';
  assert (select count(*) from public.visits where person_id = v_a) = 1, 'never a second one';

  v_failed := false;
  begin
    perform public.field_book(v_a, jsonb_build_object('project_id', v_project, 'visit_date', v_date, 'time', '23:30'));
  exception when others then
    v_failed := sqlerrm = 'visit_time_outside_slots';
  end;
  assert v_failed, 'an hour outside the visit slots is refused';

  v_failed := false;
  begin
    perform public.field_book(v_c, jsonb_build_object('project_id', v_project, 'visit_date', v_date, 'time', '09:30'));
  exception when others then
    v_failed := sqlstate = '42501';
  end;
  assert v_failed, 'he cannot book for a file that is not his';

  assert (select x->>'step' from jsonb_array_elements(public.field_board()->'people') x where x->'person'->>'id' = v_a::text)
         in ('planned', 'today'), 'the appointment shows on his list';

  -- ── the result: a deposit of 50 dinars for two trees ─────────────────────────────────────────────────────
  v_failed := false;
  begin
    perform public.field_report((v_visit->>'id')::uuid, jsonb_build_object('result', 'deposit', 'trees', 2));
  exception when others then
    v_failed := sqlerrm = 'invalid_deposit_amount';
  end;
  assert v_failed, 'a deposit needs its amount';

  v_out := public.field_report((v_visit->>'id')::uuid,
                               jsonb_build_object('result', 'deposit', 'trees', 2, 'amount_millimes', 50000, 'note', 'خلّص نقداً'));
  assert v_out->'visit'->>'status' = 'completed', 'the visit is done';
  assert v_out->'visit'->>'field_result' = 'deposit', 'with the owner''s word';
  select * into v_res from public.reservations where id = (v_out->'reservation'->>'id')::uuid;
  assert v_res.status = 'deposit_paid', 'the hold is paid';
  assert v_res.deposit_due_millimes = 50000, 'what was paid is the deposit';
  assert v_res.valid_days = app.setting_int('reservations.valid_days_default', -1), 'for the offer''s days';
  assert (select count(*) from public.trees where reservation_id = v_res.id and state = 'reserved') = 2, 'two trees are held';
  select * into v_pay from public.payments where id = (v_out->>'payment_id')::uuid;
  assert v_pay.recorded_by = v_com and v_pay.amount_millimes = 50000 and v_pay.kind = 'deposit', 'the commercial recorded the money';
  assert v_pay.method_label_ar is not null, 'cash by default';

  v_receipt := public.field_receipt(v_pay.id);
  assert (v_receipt->>'amount_millimes')::bigint = 50000, 'the receipt carries the amount';
  assert v_receipt->'reservation'->>'reference_no' = v_res.reference_no, 'and the hold it pays';
  assert v_receipt->>'note' like '%{date}%', 'and the sentence with the date';

  v_failed := false;
  begin
    perform public.field_report((v_visit->>'id')::uuid, jsonb_build_object('result', 'disliked'));
  exception when others then
    v_failed := sqlerrm = 'visit_already_reported';
  end;
  assert v_failed, 'a visit is reported once';
  assert (select x->>'step' from jsonb_array_elements(public.field_board()->'people') x where x->'person'->>'id' = v_a::text) = 'done',
    'and he is finished';

  -- ── the one who did not come goes back to «كلّمهم» ─────────────────────────────────────────────────────────
  v_visit_b := public.field_book(v_b, jsonb_build_object('project_id', v_project, 'visit_date', v_date, 'time', '10:00'));
  v_out := public.field_report((v_visit_b->>'id')::uuid, jsonb_build_object('result', 'no_show'));
  assert v_out->'visit'->>'status' = 'no_show', 'he did not come';
  assert (select x->>'step' from jsonb_array_elements(public.field_board()->'people') x where x->'person'->>'id' = v_b::text) = 'call',
    'so he is called again';

  v_out := public.field_person(v_a);
  assert v_out->'reservation'->>'status' = 'deposit_paid', 'the file shows the hold';
  assert jsonb_array_length(v_out->'offers') >= 1, 'and the offers he can book';

  -- ── the administrator takes someone off the list ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.admin_field_remove(v_b);
  assert not exists (select 1 from public.field_list where person_id = v_b and removed_at is null), 'off the list';
  assert (public.field_board(v_com)->'user'->>'id')::uuid = v_com, 'an administrator reads anyone''s list';

  perform set_config('request.jwt.claims', '', true);
end $$;
