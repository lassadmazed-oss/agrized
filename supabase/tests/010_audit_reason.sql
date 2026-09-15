-- Sensitive operations carry their reason into the audit log, and the log stays append-only.
-- Spec: §51 (who, what, old value, new value, when, reason), AUD-01, AUD-02.

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner): an admin, a setting row owned by this test, a sensitive RPC
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a0d17', 'authenticated', 'authenticated', 'audit-reason-admin@test.local',
   '{"full_name":"Audit Reason Admin"}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000a0d17', 'admin');

insert into public.settings (key, value, value_type, group_key, label_ar, is_public)
values ('test.audit_reason_probe', to_jsonb(100), 'integer', 'test', 'مسبار سجل العمليات', false);

-- Padded so the test still passes if AgriZed raised the live minimum.
select set_config('test.reason', rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 5)), '.'), true)
from (values ('تصحيح السعر بعد مراجعة محضر المعاينة')) as t (s);

-- Stands in for a real sensitive RPC (a price or parcel-status change) that follows the §51 convention.
create function pg_temp.probe_change(p_key text, p_value integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  select value into v_old from public.settings where key = p_key;
  update public.settings set value = to_jsonb(p_value) where key = p_key;
  perform app.write_audit('setting.probe_changed', 'settings', p_key,
                          jsonb_build_object('value', v_old), jsonb_build_object('value', p_value), null);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The minimum comes from a private setting, and the helpers refuse a missing reason
-- ---------------------------------------------------------------------------

do $$
declare
  v_min integer := app.setting_int('audit.reason_min_length', 0);
begin
  assert exists (select 1 from public.settings
                 where key = 'audit.reason_min_length' and value_type = 'integer' and not is_public),
    'audit.reason_min_length is a private integer setting';
  assert v_min >= 1, 'the minimum reason length is at least 1, got ' || v_min;

  assert app.require_reason(E'  سبب واضح\n', 1) = 'سبب واضح', 'require_reason returns the reason without surrounding blanks';
  assert app.require_reason(repeat('ب', v_min)) = repeat('ب', v_min), 'a reason of exactly the minimum length is accepted';

  begin
    perform app.require_reason(repeat('ب', v_min - 1));
    raise exception 'expected reason_required for a reason one character too short but it was accepted';
  exception when others then
    if sqlerrm <> 'reason_required' then
      raise exception 'expected reason_required for a too-short reason but got "%"', sqlerrm;
    end if;
  end;

  begin
    perform app.require_reason('', 0);
    raise exception 'expected reason_required for an empty reason with a zero minimum but it was accepted';
  exception when others then
    if sqlerrm <> 'reason_required' then
      raise exception 'expected reason_required for an empty reason with a zero minimum but got "%"', sqlerrm;
    end if;
  end;

  assert not has_function_privilege('authenticated', 'app.set_reason(text)', 'execute')
     and not has_function_privilege('anon', 'app.set_reason(text)', 'execute')
     and not has_function_privilege('authenticated', 'app.require_reason(text, integer)', 'execute')
     and not has_function_privilege('anon', 'app.require_reason(text, integer)', 'execute'),
    'the reason helpers are callable only from inside security-definer RPCs';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · An admin changes a sensitive value through the RPC, with and without a reason
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000a0d17", "role": "authenticated"}';

do $$
declare
  v_bad text;
begin
  perform pg_temp.probe_change('test.audit_reason_probe', 120, '  ' || current_setting('test.reason') || E'\n');

  foreach v_bad in array array['', '   ', E'\n\t', null]::text[] loop
    begin
      perform pg_temp.probe_change('test.audit_reason_probe', 999, v_bad);
      raise exception 'expected reason_required for reason % but the change went through', quote_nullable(v_bad);
    exception when others then
      if sqlerrm <> 'reason_required' then
        raise exception 'expected reason_required for reason % but got "%"', quote_nullable(v_bad), sqlerrm;
      end if;
    end;
  end loop;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · The log holds who, old value, new value and the reason, on the row change and the named event
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin  constant uuid := '00000000-0000-0000-0000-0000000a0d17';
  v_reason constant text := current_setting('test.reason');
  v_log    public.audit_logs;
begin
  select * into v_log from public.audit_logs
  where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'insert';
  assert found and v_log.reason is null, 'a change made before any reason was given logs no reason';

  assert (select count(*) from public.audit_logs
          where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'update') = 1,
    'only the change that had a reason was logged as an update';
  select * into v_log from public.audit_logs
  where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'update';
  assert v_log.reason = v_reason, format('the row-trigger log carries the trimmed reason, got %L', v_log.reason);
  assert v_log.actor_id = v_admin, 'the row-trigger log names the admin who made the change';
  assert v_log.old_data->'value' = to_jsonb(100) and v_log.new_data->'value' = to_jsonb(120),
    'the row-trigger log keeps the old and the new value';

  select * into v_log from public.audit_logs
  where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'setting.probe_changed';
  assert found, 'the named event setting.probe_changed was written through app.write_audit';
  assert v_log.reason = v_reason, format('the named event carries the reason, got %L', v_log.reason);
  assert v_log.actor_id = v_admin, 'the named event names the admin who made the change';
  assert v_log.old_data = '{"value": 100}'::jsonb and v_log.new_data = '{"value": 120}'::jsonb,
    'the named event keeps the old and the new value';

  assert (select value from public.settings where key = 'test.audit_reason_probe') = to_jsonb(120),
    'a change without a reason is not applied';
  assert (select count(*) from public.audit_logs
          where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'setting.probe_changed') = 1,
    'a change without a reason writes no event';

  -- Later in the same transaction an event inherits the reason, and an explicit p_reason wins
  perform app.write_audit('setting.probe_inherited', 'settings', 'test.audit_reason_probe', null, null, null);
  perform app.write_audit('setting.probe_explicit', 'settings', 'test.audit_reason_probe', null, null, 'سبب صريح للحدث');
  assert (select reason from public.audit_logs
          where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'setting.probe_inherited') = v_reason,
    'an event written later in the same transaction inherits app.reason';
  assert (select reason from public.audit_logs
          where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'setting.probe_explicit') = 'سبب صريح للحدث',
    'an explicit p_reason overrides app.reason';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The log stays append-only for every role that can reach the table (AUD-02)
-- ---------------------------------------------------------------------------

-- TRUNCATE is not tried: it would take an exclusive lock on the live audit log for the whole test.
do $$
declare
  v_id     bigint := (select id from public.audit_logs
                      where entity = 'settings' and entity_id = 'test.audit_reason_probe' and action = 'setting.probe_changed');
  v_before jsonb := (select to_jsonb(a) from public.audit_logs a where a.id = v_id);
  v_role   text;
  v_rows   bigint;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    execute format('set local role %I', v_role);
    begin
      update public.audit_logs set reason = 'tampered' where id = v_id;
      get diagnostics v_rows = row_count;
      assert v_rows = 0, format('%s edited an audit row', v_role);
    exception
      when insufficient_privilege then null;
      when raise_exception then
        if sqlerrm <> 'audit_logs is append-only' then raise; end if;
    end;
    begin
      delete from public.audit_logs where id = v_id;
      get diagnostics v_rows = row_count;
      assert v_rows = 0, format('%s deleted an audit row', v_role);
    exception
      when insufficient_privilege then null;
      when raise_exception then
        if sqlerrm <> 'audit_logs is append-only' then raise; end if;
    end;
    reset role;
  end loop;

  begin
    update public.audit_logs set reason = 'tampered' where id = v_id;
    raise exception 'the table owner must not edit an audit row';
  exception when others then
    if sqlerrm <> 'audit_logs is append-only' then raise; end if;
  end;
  begin
    delete from public.audit_logs where id = v_id;
    raise exception 'the table owner must not delete an audit row';
  exception when others then
    if sqlerrm <> 'audit_logs is append-only' then raise; end if;
  end;

  assert (select to_jsonb(a) from public.audit_logs a where a.id = v_id) = v_before,
    'the audit row is exactly as it was written';
end $$;
