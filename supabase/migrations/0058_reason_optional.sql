-- «سبب التغيير» stops being compulsory (owner, 2026-09-19: «remove the سبب التغيير, too dumb»).
--
-- Every sensitive act — a price, a spacing class, an allowed percentage, releasing a tree, a setting — made the
-- writer type a sentence first, at least audit.reason_min_length characters of it. With one person running the
-- product that is a box to fill in before every save, ten screens deep, and it was being filled with whatever
-- passed the length check, which is worse than nothing: an audit trail of «....» reads as evidence and is not.
--
-- WHAT IS GIVEN UP, EXACTLY. Nothing but the typed sentence. app.audit_row_change still writes who, when, which
-- table, which row, the old value and the new one, and audit_logs is still append-only. The reason column simply
-- arrives empty. Nobody loses the ability to answer «what changed and who changed it»; the answer to «why» now
-- lives wherever the team keeps it, and not in a box that must be satisfied to press save.
--
-- HOW IT COMES BACK. This is a setting, not a deletion. audit.reason_min_length above zero restores the old
-- behaviour everywhere at once — the field reappears in all ten screens (src/components/admin/reason-field.tsx
-- renders nothing while the minimum is zero) and the database enforces it again. A team with more than one pair
-- of hands will want it back; one number in الإعدادات is the whole change.
--
-- The floor moves from «always at least 1» to «at least 1 unless the configured minimum is exactly 0». A caller
-- passing p_min_len explicitly keeps its own rule, so a future act that must be explained can demand it while
-- everything else stays quiet.

create or replace function app.require_reason(p_reason text, p_min_len integer default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_reason text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g');
  -- The configured (or passed) minimum, taken as written. Zero is now an answer — «this product does not ask
  -- for a reason» — and not a misconfiguration to be corrected upward.
  v_min    integer := coalesce(p_min_len, app.setting_int('audit.reason_min_length', 5));
begin
  if v_min <= 0 then
    return v_reason;
  end if;

  if char_length(v_reason) < v_min then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  return v_reason;
end $$;

comment on function app.require_reason(text, integer) is
  'The reason attached to a sensitive change (§51). Trims it, and refuses one shorter than the minimum — '
  'audit.reason_min_length, or the length the caller passes. A minimum of zero asks for no reason at all '
  '(0058): the audit row still carries who, when, the old value and the new one.';

update public.settings
set value = to_jsonb(0),
    description_ar =
      'عدد الأحرف الأدنى لسبب تغيير الأسعار وحالات الزيتونات والحجوزات. '
      || 'اكتب 0 باش ما يتطلبش سبب بالمرّة وتتخبّى الخانة من كل الشاشات — وهذا هو الوضع الحالي. '
      || 'أي رقم أكبر من 0 يرجّع الخانة ويفرضها. سجلّ العمليات يسجّل في كل الحالات مين بدّل وشنوّة كانت القيمة وشنوّة ولّات.',
    updated_at = now()
where key = 'audit.reason_min_length';
