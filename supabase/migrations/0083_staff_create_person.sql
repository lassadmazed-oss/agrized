-- A client the company met without a form (owner, 2026-09-23: «I don't like how I need to sell from the form
-- stuff; instead we can make a separate page that we sell from»).
--
-- WHAT WAS IMPOSSIBLE BEFORE THIS. public.persons is created by the public intake and by nothing else: 0002
-- revokes INSERT on it from `authenticated`, so every person in the database arrived by filling a form. A
-- walk-in, a phone call, a client met at the farm — none of them could be sold to at all, because the sale
-- starts from a person and there was no way for staff to make one. The Back Office could advance a lead and
-- never open a file.
--
-- WHY A SECURITY DEFINER FUNCTION AND NOT A GRANT. Handing `authenticated` a plain INSERT would let any
-- signed-in staff member write any row, including a `status_id` that skips the pipeline or a phone that
-- collides with someone else's file. This owns the rules instead: it normalises and checks the phone with
-- the same app.assert_phone the intake uses, upserts on it so a number already known REUSES that file rather
-- than forking a second one, and puts a new person on the default «جديد» stage like every other lead.
--
-- IT IS DELIBERATELY NOT AN INTAKE. It writes no interest_request: a demand is something a customer asked
-- for, and inventing one for a client the commercial met in person would put words in their mouth and pollute
-- the funnel's own numbers. The person exists; what the company agreed to sell is the reservation and the
-- contract that follow, which is where that record belongs.

create or replace function public.staff_create_person(
  p_full_name text,
  p_phone     text,
  p_email     text default null,
  p_governorate_id smallint default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text := btrim(coalesce(p_full_name, ''));
  v_phone  text;
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_status uuid;
  v_id     uuid;
  v_new    boolean;
begin
  -- Same gate as every other staff write: the commercial who will own the file, or an admin above them.
  if not app.has_any_role(array['admin', 'super_admin', 'commercial']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if char_length(v_name) < 3 then
    raise exception 'invalid_name';
  end if;

  -- The caller hands the number already in E.164, exactly as the public intake does — the normalising lives
  -- in one place in TypeScript and Postgres is the one that refuses anything that is not a real line.
  v_phone := btrim(coalesce(p_phone, ''));
  perform app.assert_phone(v_phone, 'invalid_phone');

  select id into v_status
    from public.lead_statuses
   where stage = 'new' and is_active
   order by is_stage_default desc, sort_order
   limit 1;

  insert into public.persons as ps (full_name, phone_e164, whatsapp_e164, email, governorate_id, status_id)
  values (v_name, v_phone, v_phone, v_email, p_governorate_id, v_status)
  on conflict (phone_e164) do update
    -- An existing file is never overwritten from here. The number identifies the person; the name and e-mail
    -- on their file were entered by them or corrected by staff, and a second meeting is not a reason to lose
    -- either. Only the freshness marker moves.
    set last_request_at = now()
  returning ps.id, (ps.xmax = 0) into v_id, v_new;

  return jsonb_build_object('person_id', v_id, 'created', v_new);
end $$;

revoke execute on function public.staff_create_person(text, text, text, smallint) from public, anon;
grant execute on function public.staff_create_person(text, text, text, smallint) to authenticated;

comment on function public.staff_create_person(text, text, text, smallint) is
  'يفتح ملف حريف من الباك أوفيس (بلا فورمولير). الرقم هو المفتاح: كان موجود، يرجّع نفس الملف.';
