-- 0130 · a visitor abroad books a live video visit: any international number, a time on offer in their own
-- time zone, the person marked as living abroad, a full time closed to the next one, and the team moves it.
do $$
declare
  v_slot    text;
  v_slot_at timestamptz;
  v_hour    text;
  v_day     date;
  v_days    jsonb := (select s.value from public.settings s where s.key = 'abroad.video_weekdays');
  v_phone   text := '+336' || lpad(floor(random() * 1e8)::bigint::text, 8, '0');
  v_other   text := '+4915' || lpad(floor(random() * 1e8)::bigint::text, 8, '0');
  v_known   text := '+3933' || lpad(floor(random() * 1e8)::bigint::text, 8, '0');
  v_result  jsonb;
  v_row     public.video_visit_requests;
  v_person  public.persons;
  v_admin   uuid;
  v_error   text;
  v_base    jsonb;
begin
  update public.feature_flags set state = 'public' where key = 'abroad';
  update public.settings set value = '1'::jsonb where key = 'abroad.video_per_slot';
  update public.settings set value = '20'::jsonb where key = 'abroad.video_min_hours_ahead';

  -- The first time on offer, found the way the page finds it: a weekday on offer, an hour on offer, far enough
  -- ahead. Tunisian wall time.
  v_hour := (select s.value->>0 from public.settings s where s.key = 'abroad.video_hours');
  for i in 1..30 loop
    v_day := (now() at time zone 'Africa/Tunis')::date + i;
    continue when not (v_days @> to_jsonb(extract(isodow from v_day)::int));
    v_slot := to_char(v_day, 'YYYY-MM-DD') || 'T' || v_hour;
    v_slot_at := v_slot::timestamp at time zone 'Africa/Tunis';
    exit when v_slot_at >= now() + interval '20 hours';
  end loop;
  assert v_slot is not null, 'no time on offer in the next 30 days';

  v_base := jsonb_build_object(
    'full_name', 'Amira Ben Salah',
    'whatsapp_e164', v_phone,
    'country_code', 'FR',
    'time_zone', 'Europe/Paris',
    'slot', v_slot,
    'note', 'نحب نشوف البير',
    'consent_text', 'موافق'
  );

  -- 1 · A French number is accepted, the request is written, the person exists and lives abroad.
  v_result := public.submit_video_visit(v_base);
  assert v_result->>'request_no' ~ '-\d{4}-\d{5}$', format('unexpected request number: %s', v_result);
  select * into v_row from public.video_visit_requests where request_no = v_result->>'request_no';
  assert v_row.status = 'requested', 'a new request is not «requested»';
  assert v_row.preferred_at = v_slot_at, format('the time was not kept: %s vs %s', v_row.preferred_at, v_slot_at);
  assert v_row.time_zone = 'Europe/Paris' and v_row.country_code = 'FR', 'the zone or the country was not kept';
  select * into v_person from public.persons where id = v_row.person_id;
  assert v_person.phone_e164 = v_phone, 'the person is not the one with this number';
  assert v_person.lives_abroad, 'a visitor who booked from /abroad is not marked as living abroad';

  -- 2 · The time is now full for the next visitor, and the public list says so.
  begin
    perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', v_other));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'video_slot_taken', format('a full time was booked twice (%s)', v_error);
  assert public.video_visit_taken() @> to_jsonb(array[v_slot_at]), 'the full time is not in video_visit_taken()';

  -- 3 · A time that is not on offer, a time in the past, a bad number and no consent are refused by name.
  begin
    perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', v_other,
      'slot', to_char(v_day, 'YYYY-MM-DD') || 'T03:17'));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'invalid_video_slot', format('an hour not on offer was accepted (%s)', v_error);

  begin
    perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', v_other,
      'slot', to_char((now() at time zone 'Africa/Tunis')::date - 1, 'YYYY-MM-DD') || 'T' || v_hour));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'invalid_video_slot', format('a time in the past was accepted (%s)', v_error);

  begin
    perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', '0612345678'));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'invalid_whatsapp', format('a number without its country code was accepted (%s)', v_error);

  begin
    perform public.submit_video_visit((v_base - 'consent_text') || jsonb_build_object('whatsapp_e164', v_other));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'consent_required', format('a request without consent was accepted (%s)', v_error);

  -- 4 · A person already on file who had not said they live abroad is marked by booking, never unmarked.
  insert into public.persons (full_name, phone_e164, whatsapp_e164, status_id, lives_abroad)
  values ('Karim Test', v_known, v_known,
          (select id from public.lead_statuses where stage = 'new' order by sort_order limit 1), false);
  update public.settings set value = '5'::jsonb where key = 'abroad.video_per_slot';
  perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', v_known, 'full_name', 'Karim Test'));
  assert (select lives_abroad from public.persons where phone_e164 = v_known), 'the known person was not marked as living abroad';
  assert (select count(*) from public.persons where phone_e164 = v_known) = 1, 'a second person was created for one number';

  -- 5 · A closed module refuses outright.
  update public.feature_flags set state = 'disabled' where key = 'abroad';
  begin
    perform public.submit_video_visit(v_base || jsonb_build_object('whatsapp_e164', v_other));
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'abroad_closed', format('a closed module took a booking (%s)', v_error);

  -- 6 · Nobody outside the team can move a request.
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.staff_set_video_visit(v_row.id, '{"status": "confirmed"}'::jsonb);
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'forbidden', format('an anonymous caller moved a video visit (%s)', v_error);

  -- 7 · The team confirms it — at the visitor's own time unless told otherwise — then marks it done.
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; the staff half is not proven here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_row := public.staff_set_video_visit(v_row.id, '{"status": "confirmed"}'::jsonb);
  assert v_row.status = 'confirmed' and v_row.scheduled_at = v_row.preferred_at,
    'confirming without a time did not keep the visitor''s own';
  assert v_row.status_changed_by = v_admin, 'the change does not name who made it';

  v_row := public.staff_set_video_visit(v_row.id,
    jsonb_build_object('status', 'confirmed', 'scheduled_at', to_char(v_day, 'YYYY-MM-DD') || 'T15:30'));
  assert v_row.scheduled_at = (to_char(v_day, 'YYYY-MM-DD') || 'T15:30')::timestamp at time zone 'Africa/Tunis',
    'a time typed in the Back Office is not read as Tunisian time';

  v_row := public.staff_set_video_visit(v_row.id, '{"status": "done", "staff_note": "شاف البير والطريق"}'::jsonb);
  assert v_row.status = 'done' and v_row.staff_note = 'شاف البير والطريق', 'the visit was not closed with its note';

  begin
    perform public.staff_set_video_visit(v_row.id, '{"status": "lost"}'::jsonb);
    v_error := null;
  exception when others then v_error := sqlerrm;
  end;
  assert v_error = 'invalid_status', format('an unknown status was accepted (%s)', v_error);

  -- 8 · Every change is in the audit log.
  assert (select count(*) from public.audit_logs a
          where a.entity = 'video_visit_requests' and a.entity_id = v_row.id::text) >= 4,
    'the video visit''s changes were not audited';
end $$;
