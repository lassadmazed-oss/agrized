-- 0024 · Reason for sensitive operations
-- Spec: §51 (who, what, old value, new value, when, reason: prices, reservations, payments, contracts,
-- parcel statuses), AUD-01..04.
--
-- Convention for every sensitive security-definer RPC:
--   1. check the caller's role;
--   2. perform app.set_reason(p_reason);  refuses a missing reason, then every row trigger logs it;
--   3. run the DML;
--   4. perform app.write_audit('<entity>.<event>', '<table>', id, old, new, null);  named event, same reason.
-- audit_logs, app.write_audit, app.audit_row_change and the append-only guards are unchanged:
-- write_audit already stores coalesce(p_reason, current_setting('app.reason')) since 0001.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('audit.reason_min_length', to_jsonb(5), 'integer', 'audit', 'أقل طول لسبب العملية الحساسة',
   'عدد الأحرف الأدنى لسبب تغيير الأسعار وحالات القطع والحجوزات والدفعات والعقود. السبب يُحفظ في سجل العمليات. أقل قيمة مقبولة: 1.',
   false, 10);

create or replace function app.require_reason(p_reason text, p_min_len integer default null) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_reason text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
  -- Never below 1, so an empty reason is refused whatever the setting holds.
  v_min    integer := greatest(1, coalesce(p_min_len, app.setting_int('audit.reason_min_length', 5)));
begin
  if char_length(v_reason) < v_min then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  return v_reason;
end $$;

create or replace function app.set_reason(p_reason text) returns text
language plpgsql set search_path = '' as $$
declare
  v_reason text := app.require_reason(p_reason);
begin
  -- Transaction-local: PostgREST runs each RPC call in its own transaction, so the reason cannot leak.
  perform set_config('app.reason', v_reason, true);
  return v_reason;
end $$;

revoke execute on function app.require_reason(text, integer) from public, anon, authenticated;
revoke execute on function app.set_reason(text) from public, anon, authenticated;
