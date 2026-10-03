-- 0110 · لغة الحريف — AN EXPLICIT CHOICE IS NEVER OVERWRITTEN BY THE PAGE IT WAS MADE FROM.
--
-- Its test is supabase/tests/068_i18n_explicit_locale.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0110_i18n_explicit_locale.sql supabase/tests/068_i18n_explicit_locale.sql
--
-- TWO CORRECTIONS TO 0109, found while wiring the language selector and the Back Office.
--
-- 1 · THE SELECTOR'S SAVE COULD UNDO ITSELF. 0109's trigger records the page's language on a person whose
--     row is touched by a public request — unless the same statement set the column explicitly, which it
--     detects as «the column changed». A client whose file already says French, standing on the German page
--     and choosing French in the selector, writes French over French: «unchanged», so the trigger wrote the
--     page's German over the choice they had just made. The explicit paths now say so, in a transaction-local
--     flag the trigger honours, instead of the trigger guessing from the value.
--
-- 2 · staff_set_person_locale WAS WIDER THAN THE FILE. 0109 let any staff role set any client's language;
--     the file itself (persons_update) is the admins' and the assigned commercial's. The language is a field
--     of that file, so it now follows the same rule.

create or replace function app.persons_capture_locale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_locale text := app.request_locale();
begin
  -- An explicit choice in this transaction (set_my_locale, staff_set_person_locale) is the answer.
  if v_locale is null or current_setting('app.locale_explicit', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.preferred_locale := coalesce(new.preferred_locale, v_locale);
  elsif new.preferred_locale is not distinct from old.preferred_locale then
    new.preferred_locale := v_locale;
  end if;
  return new;
end $$;

create or replace function public.set_my_locale(p_locale text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locales l where l.code = p_locale and l.is_enabled) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_locale');
  end if;
  perform set_config('app.locale_explicit', 'on', true);
  update public.persons p set preferred_locale = p_locale
   where p.profile_id = auth.uid() and p.archived_at is null
  returning p.id into v_person;
  return jsonb_build_object('ok', v_person is not null);
end $$;

create or replace function public.staff_set_person_locale(p_person uuid, p_locale text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  -- The same people who may edit the file (persons_update): the admins, and the commercial it is assigned to.
  if not (app.is_admin()
          or (app.has_role('commercial')
              and exists (select 1 from public.persons p where p.id = p_person and p.assigned_to = auth.uid()))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_locale is not null and not exists (select 1 from public.locales l where l.code = p_locale) then
    raise exception 'unknown_locale' using errcode = 'P0001', hint = 'Choose one of the languages in the list.';
  end if;
  perform set_config('app.locale_explicit', 'on', true);
  update public.persons set preferred_locale = p_locale where id = p_person;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'locale', coalesce(p_locale, 'ar'));
end $$;

revoke execute on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;
revoke execute on function public.staff_set_person_locale(uuid, text) from public, anon;
grant execute on function public.staff_set_person_locale(uuid, text) to authenticated;
