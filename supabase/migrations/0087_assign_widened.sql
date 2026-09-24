-- «Add a shortcut for easy assign to me, or to …» (owner, 2026-09-23).
--
-- WHY THE SHORTCUT COULD NOT BE WRITTEN AGAINST THE FUNCTION AS IT WAS. admin_assign_persons (0002) refuses
-- any target that is not an active `commercial`. The owner's own account is a super_admin and holds no
-- commercial role, so «أسند ليّ» — the one button the owner actually wants — would have raised
-- target_not_active_commercial every single time. The rule was written when assignment meant «hand this lead
-- to a salesperson»; it is now also «I am working this one myself».
--
-- SO THE TARGET WIDENS TO THE THREE ROLES THAT CAN HOLD A FILE: commercial, admin, super_admin. It does not
-- widen to everyone — finance and legal read files, they do not own them, and an unassignable role in the
-- assignment dropdown is a bug the day someone picks it.
--
-- WHAT DOES NOT CHANGE: who may assign (app.is_admin, as before), the audit row in person_assignments, the
-- «unassign» case (a null target is still allowed and still means nobody), and the exception name — two
-- Server Actions match on target_not_active_commercial by string, and renaming it would turn a precise Arabic
-- message into «تعذّر تحويل الملف» without a single line of either file changing.

create or replace function public.admin_assign_persons(p_person_ids uuid[], p_to_user uuid, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count  integer := 0;
  v_person record;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to_user is not null and not exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_to_user
      and ur.role in ('commercial', 'admin', 'super_admin')
      and p.is_active
  ) then
    raise exception 'target_not_active_commercial';
  end if;

  for v_person in
    select id, assigned_to from public.persons
    where id = any (p_person_ids) and assigned_to is distinct from p_to_user
    for update
  loop
    update public.persons set assigned_to = p_to_user where id = v_person.id;
    insert into public.person_assignments (person_id, from_user, to_user, reason, created_by)
    values (v_person.id, v_person.assigned_to, p_to_user, p_reason, auth.uid());
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

comment on function public.admin_assign_persons(uuid[], uuid, text) is
  'يحوّل ملفات لمسؤول. المسؤول لازم يكون نشيط وعندو دور commercial ولا admin ولا super_admin (ولا null باش يتنحّى المسؤول). يكتب سطر في person_assignments لكل ملف تبدّل.';
