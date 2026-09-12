-- Access rules for the demand CRM, admin RPCs and audit log.
-- Spec: PERM-01, PERM-03, COM-05, COM-09, AUD-02, LAND-01, CRM-05 (database side).

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'com1@test.local', '{"full_name":"Commercial One"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'com2@test.local', '{"full_name":"Commercial Two"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'fin@test.local',  '{"full_name":"Finance"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'adm@test.local',  '{"full_name":"Admin"}');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'commercial'),
  ('00000000-0000-0000-0000-0000000000c2', 'commercial'),
  ('00000000-0000-0000-0000-0000000000f1', 'finance'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin');

create function pg_temp.payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف تجريبي',
    'residence_governorate_id', 34,
    'residence_delegation_id', (select id from public.delegations where governorate_id = 34 order by sort_order limit 1),
    'invest_anywhere', true,
    'project_type_unsure', true,
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'family'),
    'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_500'),
    'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_50'),
    'contact_channel', 'phone',
    'consent_text', 'أوافق'
  ) || p_overrides
$$;

select public.submit_interest_request(pg_temp.payload('{"phone_e164": "+21650000001"}'));
select public.submit_interest_request(pg_temp.payload('{"phone_e164": "+21650000002"}'));
update public.persons set assigned_to = '00000000-0000-0000-0000-0000000000c1' where phone_e164 = '+21650000001';
update public.persons set assigned_to = '00000000-0000-0000-0000-0000000000c2' where phone_e164 = '+21650000002';

select set_config('test.p1', (select id::text from public.persons where phone_e164 = '+21650000001'), true);
select set_config('test.p2', (select id::text from public.persons where phone_e164 = '+21650000002'), true);

-- ---------------------------------------------------------------------------
-- Visitor (anon)
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  begin
    perform 1 from public.persons;
    raise exception 'anon must not read persons';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.land_offers;
    raise exception 'anon must not read land offers (LAND-01)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_interest_request('{}'::jsonb);
    raise exception 'anon must not call the intake RPC directly';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.governorates) = 24, 'anon reads the 24 governorates';
  assert (select count(*) from public.delegations) = 279, 'anon reads the 279 delegations';
  assert (select count(*) from public.settings where not is_public) = 0, 'anon reads public settings only';
  assert (select count(*) from public.feature_flags) > 0, 'anon reads feature flags';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Commercial One
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

do $$
begin
  assert (select count(*) from public.persons) = 1, 'commercial sees only own persons (COM-05)';
  assert (select count(*) from public.crm_requests) = 1, 'commercial sees only own requests in the CRM view';
  assert (select phone_e164 from public.persons) = '+21650000001', 'commercial sees the right person';

  update public.persons
  set status_id = (select id from public.lead_statuses where stage = 'contacting' and is_stage_default)
  where id = current_setting('test.p1')::uuid;
  assert found, 'commercial updates the status of an own file';
  assert exists (select 1 from public.person_status_history
                 where person_id = current_setting('test.p1')::uuid
                   and changed_by = '00000000-0000-0000-0000-0000000000c1'), 'status change is kept in history';

  update public.persons set full_name = 'x' where id = current_setting('test.p2')::uuid;
  assert not found, 'commercial cannot edit a colleague''s file';

  begin
    update public.persons set assigned_to = '00000000-0000-0000-0000-0000000000c1'
    where id = current_setting('test.p1')::uuid;
    raise exception 'commercial must not change file ownership';
  exception when insufficient_privilege then null;
  end;

  insert into public.person_notes (person_id, body) values (current_setting('test.p1')::uuid, 'اتصلت به');
  begin
    insert into public.person_notes (person_id, body) values (current_setting('test.p2')::uuid, 'x');
    raise exception 'commercial must not add notes to a colleague''s file';
  exception when insufficient_privilege then null;
  end;

  insert into public.contact_attempts (person_id, channel, outcome, next_follow_up_at)
  values (current_setting('test.p1')::uuid, 'phone', 'no_answer', now() + interval '1 day');

  begin
    perform public.admin_assign_persons(array[current_setting('test.p2')::uuid], '00000000-0000-0000-0000-0000000000c1', 'x');
    raise exception 'commercial must not transfer files';
  exception when insufficient_privilege then null;
  end;

  assert (select count(*) from public.audit_logs) = 0, 'commercial cannot read the audit log';
  assert (select count(*) from public.user_roles) = 1, 'commercial sees only own roles';
end $$;

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

do $$
begin
  assert (select count(*) from public.persons where phone_e164 in ('+21650000001', '+21650000002')) = 2,
    'finance reads all files';
  update public.persons set full_name = 'x' where id = current_setting('test.p1')::uuid;
  assert not found, 'finance cannot edit files';

  begin
    insert into public.person_notes (person_id, body) values (current_setting('test.p1')::uuid, 'x');
    raise exception 'finance must not add notes (read-only on the CRM)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.contact_attempts (person_id, channel, outcome)
    values (current_setting('test.p1')::uuid, 'phone', 'answered');
    raise exception 'finance must not log contact attempts (read-only on the CRM)';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

do $$
declare
  v_count integer;
begin
  v_count := public.admin_assign_persons(
    array[current_setting('test.p2')::uuid], '00000000-0000-0000-0000-0000000000c1', 'مغادرة الموظف');
  assert v_count = 1, 'admin transfers one file (COM-09)';
  assert exists (select 1 from public.person_assignments
                 where person_id = current_setting('test.p2')::uuid
                   and from_user = '00000000-0000-0000-0000-0000000000c2'
                   and to_user = '00000000-0000-0000-0000-0000000000c1'
                   and created_by = '00000000-0000-0000-0000-0000000000a1'), 'transfer history is kept';

  begin
    perform public.admin_assign_persons(array[current_setting('test.p1')::uuid], '00000000-0000-0000-0000-0000000000f1', 'x');
    raise exception 'a finance user is not a valid transfer target';
  exception when others then
    if sqlerrm <> 'target_not_active_commercial' then raise; end if;
  end;

  begin
    perform public.admin_set_role('00000000-0000-0000-0000-0000000000c1', 'super_admin', true);
    raise exception 'admin must not grant super_admin (PERM-03)';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_set_role('00000000-0000-0000-0000-0000000000f1', 'legal', true);
  assert exists (select 1 from public.user_roles
                 where user_id = '00000000-0000-0000-0000-0000000000f1' and role = 'legal'), 'admin grants a role';

  assert (select count(*) from public.audit_logs where entity = 'person_assignments') > 0, 'admin reads the audit log';
  assert exists (select 1 from public.audit_logs
                 where entity = 'user_roles' and actor_id = '00000000-0000-0000-0000-0000000000a1'),
    'role change is audited with the admin as actor';
end $$;

-- Commercial Two lost the transferred file
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';

do $$
begin
  assert (select count(*) from public.persons) = 0, 'previous owner no longer sees a transferred file';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Audit log is append-only, even for the owner role (AUD-02)
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    update public.audit_logs set action = 'tampered' where id = (select min(id) from public.audit_logs);
    raise exception 'audit log rows must not be editable';
  exception when others then
    if sqlerrm <> 'audit_logs is append-only' then raise; end if;
  end;
  begin
    delete from public.audit_logs where id = (select min(id) from public.audit_logs);
    raise exception 'audit log rows must not be deletable';
  exception when others then
    if sqlerrm <> 'audit_logs is append-only' then raise; end if;
  end;
end $$;
