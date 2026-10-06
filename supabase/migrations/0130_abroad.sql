-- 0130 · للتوانسة اللي برّا — A PAGE OF THEIR OWN, A VIRTUAL VISIT, AND A LIVE VIDEO VISIT.
--
-- Its test is supabase/tests/079_abroad_video_visits.sql (rolled back).
--
-- THE OWNER (2026-10-05): «i want to make something interesting for our outside the country workers, something
-- that moves them … something like a virtual visit, something special … i want it to feel special for them
-- more than the insiders».
--
-- What a Tunisian in Lyon or Milan cannot do is the one thing the site keeps offering everyone else: drive to
-- the grove on a Saturday. So they get three things nobody at home needs:
--
--   · /abroad — their page: everything that can be done from abroad, the time at home beside their own;
--   · /projects/<code>/visit — a virtual visit of each offer, built from the offer's own photographs, facts and
--     map (no new data: it is a way of reading what the offer already publishes);
--   · a LIVE VIDEO VISIT — someone from the team walks the grove with a phone on a WhatsApp video call, at a
--     time the visitor picks in their own time zone. That one needs a row, and this file adds it.
--
-- WHY A TABLE OF ITS OWN AND NOT public.visits. A field visit is a person standing on the land: it has a
-- meeting point, a head count, a slot list in Tunisian time and a request it hangs from (submit_visit_request
-- refuses without one). A video visit has none of those and has two things a field visit never needs: the
-- visitor's time zone and an international WhatsApp number. Folding it into public.visits would mean a «mode»
-- column that half the columns ignore and every board, test and RPC of 0064 learning to skip.
--
-- THE PERSON IS THE SAME PERSON. The request carries person_id, and the person is found or created by phone
-- exactly as the two intakes do it. `persons.lives_abroad` (0121) is SET TO TRUE here and never to false: a
-- visitor who books from the abroad page has told us where they live, and a later form without the box ticked
-- must not undo that from this side. No second notion of «diaspora» is introduced.
--
-- INTERNATIONAL NUMBERS. `lead.allow_international_phone` is false on the live database, so the other forms
-- refuse a +33 number. This form is the one place where a foreign WhatsApp number is the expected answer, so it
-- accepts any E.164 number and never sends it an SMS (nothing is queued: the team writes on WhatsApp).
--
-- NOTHING HARD-CODED. The hours offered (Tunisian time, when there is daylight in the grove), the days of the
-- week, how far ahead, how soon, how many calls at once and how long a call lasts are settings `abroad.*`;
-- every word is a `ui.abroad.*` / `ui.tour.*` row with drafts in the four other languages; the page is the
-- module `abroad` in feature_flags; the hero picture is the site_media slot `abroad.hero`.

-- ---------------------------------------------------------------------------
-- The module
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('abroad', 'public', 1, 'للتوانسة بالخارج',
   'صفحة /abroad للتوانسة اللي عايشين برّا: زيارة افتراضية للعروض وحجز زيارة مباشرة بالفيديو على واتساب. كي تتحط disabled تختفي الصفحة والرابط متاعها، والزيارة الافتراضية تقعد في صفحة كل عرض.',
   120)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The live video visit
-- ---------------------------------------------------------------------------

create table if not exists public.video_visit_requests (
  id                uuid primary key default gen_random_uuid(),
  request_no        text not null unique,
  person_id         uuid not null references public.persons (id),
  -- The offer they want to see; null when they asked to be shown what there is.
  project_id        uuid references public.projects (id) on delete set null,
  full_name         text not null check (length(btrim(full_name)) between 3 and 120),
  whatsapp_e164     text not null check (whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- ISO 3166 country of the number, read from it by the server (libphonenumber); null when it cannot tell.
  country_code      text check (country_code ~ '^[A-Z]{2}$'),
  -- The visitor's IANA time zone, from their browser: the team confirms the time in it.
  time_zone         text not null check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$' and length(time_zone) <= 64),
  -- The language of the page they booked from, which is the one to write to them in.
  locale            text,
  preferred_at      timestamptz not null,
  scheduled_at      timestamptz,
  status            text not null default 'requested'
                    check (status in ('requested', 'confirmed', 'done', 'cancelled')),
  client_note       text check (client_note is null or length(client_note) <= 500),
  staff_note        text check (staff_note is null or length(staff_note) <= 1000),
  consent_text      text not null,
  source            jsonb not null default '{}'::jsonb,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint video_visit_confirmed_has_time check (status <> 'confirmed' or scheduled_at is not null)
);

comment on table public.video_visit_requests is
  'A live video visit of a grove for a visitor abroad (0130): someone from the team walks the land on a WhatsApp video call at a time the visitor chose in their own time zone. Written by public.submit_video_visit (service role), moved by public.staff_set_video_visit.';

create index if not exists video_visit_requests_person_idx on public.video_visit_requests (person_id);
create index if not exists video_visit_requests_open_idx
  on public.video_visit_requests (coalesce(scheduled_at, preferred_at)) where status in ('requested', 'confirmed');

drop trigger if exists video_visit_requests_stamp on public.video_visit_requests;
create trigger video_visit_requests_stamp before update on public.video_visit_requests
  for each row execute function app.stamp_updated();
drop trigger if exists video_visit_requests_audit on public.video_visit_requests;
create trigger video_visit_requests_audit after insert or update or delete on public.video_visit_requests
  for each row execute function app.audit_row_change();

alter table public.video_visit_requests enable row level security;

-- A commercial reads the requests of their own files and no others, the line 0064 draws for field visits.
drop policy if exists video_visit_requests_staff_read on public.video_visit_requests;
create policy video_visit_requests_staff_read on public.video_visit_requests for select to authenticated
  using ((select app.is_staff()) and app.can_see_person(person_id));

revoke all on public.video_visit_requests from anon;
grant select on public.video_visit_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Settings: when a call can be offered
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('abroad.video_hours', '["10:00", "12:00", "14:00", "16:00"]'::jsonb, 'json', 'abroad',
   'أوقات الزيارة بالفيديو (بتوقيت تونس)',
   'الساعات اللي نعرضوها على اللي برّا، بتوقيت تونس وفي الضو باش الضيعة تبان. الزائر يشوفها محسوبة بالتوقيت متاعو. مثال: ["10:00", "12:00", "14:00", "16:00"].',
   true, 10),
  ('abroad.video_weekdays', '[1, 2, 3, 4, 5, 6]'::jsonb, 'json', 'abroad',
   'أيام الزيارة بالفيديو',
   'أيام الجمعة اللي فيها زيارات بالفيديو: 1 = الاثنين … 7 = الأحد.',
   true, 11),
  ('abroad.video_days_ahead', '21'::jsonb, 'integer', 'abroad',
   'قدّاش من نهار قدّام نعرضو',
   'الزائر يختار موعد في الأيام هاذي (من غدوة).',
   true, 12),
  ('abroad.video_min_hours_ahead', '20'::jsonb, 'integer', 'abroad',
   'أقل مهلة قبل الموعد (بالساعات)',
   'ما نعرضوش موعد أقرب من هالمهلة، باش الفريق يلحق ينظّم روحو.',
   true, 13),
  ('abroad.video_per_slot', '1'::jsonb, 'integer', 'abroad',
   'قدّاش من مكالمة في نفس الوقت',
   'كي يوصل عدد المواعيد في نفس الساعة لهالرقم، الوقت يتسكّر للآخرين («محجوز»).',
   true, 14),
  ('abroad.video_minutes', '20'::jsonb, 'integer', 'abroad',
   'مدة الزيارة بالفيديو (بالدقائق)',
   'تظهر للزائر في صفحة /abroad: «قرابة 20 دقيقة على واتساب».',
   true, 15),
  ('abroad.video_request_prefix', to_jsonb('VID'::text), 'text', 'abroad',
   'بداية رقم طلب الزيارة بالفيديو',
   'رقم الطلب يجي هكا: VID-2026-00001.',
   false, 16)
on conflict (key) do nothing;

-- The hero picture of /abroad. Empty until the owner uploads one; the page then draws the brand grove.
insert into public.site_media (slot, label_ar, description_ar, aspect, group_key, sort_order) values
  ('abroad.hero', 'صورة صفحة التوانسة بالخارج',
   'صورة تحرّك القلب لواحد بعيد على البلاد: زيتون في الضو، عايلة في الضيعة، ولا طريق ريفي. تظهر في أعلى صفحة /abroad.',
   '3/2', 'abroad', 10)
on conflict (slot) do nothing;

-- ---------------------------------------------------------------------------
-- Is this time still free?
-- ---------------------------------------------------------------------------

-- The times already full, so the page can grey them out before anyone picks one. Times only — no name, no
-- number, no offer — which is why anon may read it.
create or replace function public.video_visit_taken() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t.at) order by t.at), '[]'::jsonb)
  from (
    select coalesce(v.scheduled_at, v.preferred_at) as at
    from public.video_visit_requests v
    where v.status in ('requested', 'confirmed')
      and coalesce(v.scheduled_at, v.preferred_at) >= now()
      and coalesce(v.scheduled_at, v.preferred_at)
          < now() + make_interval(days => app.setting_int('abroad.video_days_ahead', 21) + 2)
    group by 1
    having count(*) >= greatest(app.setting_int('abroad.video_per_slot', 1), 1)
  ) t
$$;

revoke execute on function public.video_visit_taken() from public;
grant execute on function public.video_visit_taken() to anon, authenticated, service_role;

comment on function public.video_visit_taken() is
  'The video-visit times that are full (abroad.video_per_slot reached), as an array of instants. Carries no personal data, so the public page reads it.';

-- ---------------------------------------------------------------------------
-- The intake
-- ---------------------------------------------------------------------------

create or replace function public.submit_video_visit(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name      text := btrim(coalesce(p->>'full_name', ''));
  v_whatsapp  text := btrim(coalesce(p->>'whatsapp_e164', ''));
  v_country   text := nullif(upper(btrim(coalesce(p->>'country_code', ''))), '');
  v_zone      text := btrim(coalesce(p->>'time_zone', ''));
  v_note      text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_consent   text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_slot      text := btrim(coalesce(p->>'slot', ''));
  v_local     timestamp;
  v_at        timestamptz;
  v_hours     jsonb := coalesce((select s.value from public.settings s where s.key = 'abroad.video_hours'), '[]'::jsonb);
  v_days      jsonb := coalesce((select s.value from public.settings s where s.key = 'abroad.video_weekdays'),
                                '[1,2,3,4,5,6]'::jsonb);
  v_project   public.projects;
  v_status_id uuid;
  v_person_id uuid;
  v_inserted  boolean;
  v_assignee  uuid;
  v_year      text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_no        text;
begin
  if not app.module_open('abroad') then
    raise exception 'abroad_closed' using errcode = 'P0001';
  end if;

  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  -- Any country: this is the form for numbers that are not Tunisian.
  if v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;
  if v_zone !~ '^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$' or length(v_zone) > 64 then
    raise exception 'invalid_time_zone' using errcode = 'P0001';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  -- The time, as the page sent it: Tunisian wall time «2026-10-12T14:00», one of the hours on offer, on a day
  -- on offer, inside the window, and not full.
  if v_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    raise exception 'invalid_video_slot' using errcode = 'P0001';
  end if;
  begin
    v_local := v_slot::timestamp;
  exception when others then
    raise exception 'invalid_video_slot' using errcode = 'P0001';
  end;
  v_at := v_local at time zone 'Africa/Tunis';
  if not (v_hours ? to_char(v_local, 'HH24:MI'))
     or not (v_days @> to_jsonb(extract(isodow from v_local)::int))
     or v_at < now() + make_interval(hours => app.setting_int('abroad.video_min_hours_ahead', 20))
     or v_local::date > (now() at time zone 'Africa/Tunis')::date + app.setting_int('abroad.video_days_ahead', 21) then
    raise exception 'invalid_video_slot' using errcode = 'P0001';
  end if;
  if (select count(*) from public.video_visit_requests v
      where v.status in ('requested', 'confirmed') and coalesce(v.scheduled_at, v.preferred_at) = v_at)
     >= greatest(app.setting_int('abroad.video_per_slot', 1), 1) then
    raise exception 'video_slot_taken' using errcode = 'P0001';
  end if;

  -- The offer is optional; when named it must be one the public can see.
  if nullif(btrim(coalesce(p->>'project_code', '')), '') is not null then
    select * into v_project from public.projects pj
    where pj.code = btrim(p->>'project_code') and pj.status = any (app.project_public_statuses());
    if v_project.id is null then
      raise exception 'offer_not_available' using errcode = 'P0001';
    end if;
  end if;

  -- Throttling (LEAD-06): the per-IP budget the other intakes share, and three bookings a day per number.
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.video_visit_requests v
      where v.whatsapp_e164 = v_whatsapp and v.created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- The person, found or created by number exactly as the intakes do it — and marked as living abroad.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, status_id, consent_at, last_request_at, lives_abroad)
  values
    (v_name, v_whatsapp, v_whatsapp, v_status_id, now(), now(), true)
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at, lives_abroad = true,
        whatsapp_e164 = coalesce(ps.whatsapp_e164, excluded.whatsapp_e164)
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12), the same rule as the two intakes.
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  v_no := app.setting_text('abroad.video_request_prefix', 'VID') || '-' || v_year || '-'
          || lpad(app.next_number('video_visit:' || v_year)::text, 5, '0');

  insert into public.video_visit_requests
    (request_no, person_id, project_id, full_name, whatsapp_e164, country_code, time_zone, locale,
     preferred_at, client_note, consent_text, source)
  values
    (v_no, v_person_id, v_project.id, v_name, v_whatsapp, v_country, v_zone, app.request_locale(),
     v_at, v_note, v_consent, app.clean_source(coalesce(p->'source', '{}'::jsonb)));

  return jsonb_build_object('request_no', v_no, 'preferred_at', v_at);
end $$;

revoke execute on function public.submit_video_visit(jsonb) from public, anon, authenticated;
grant execute on function public.submit_video_visit(jsonb) to service_role;

comment on function public.submit_video_visit(jsonb) is
  'Books a live video visit from /abroad (0130). Accepts any international WhatsApp number, finds or creates the person by it and sets persons.lives_abroad = true. Raises abroad_closed, invalid_full_name, invalid_whatsapp, invalid_time_zone, note_too_long, consent_required, invalid_video_slot, video_slot_taken, offer_not_available, rate_limited.';

-- ---------------------------------------------------------------------------
-- The team moves a request
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_video_visit(p_id uuid, p jsonb) returns public.video_visit_requests
language plpgsql security definer set search_path = '' as $$
declare
  v_row    public.video_visit_requests;
  v_status text := btrim(coalesce(p->>'status', ''));
  v_at     timestamptz;
  v_note   text := nullif(btrim(coalesce(p->>'staff_note', '')), '');
begin
  select * into v_row from public.video_visit_requests where id = p_id;
  if v_row.id is null then
    raise exception 'video_visit_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and app.can_see_person(v_row.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status not in ('requested', 'confirmed', 'done', 'cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if nullif(p->>'scheduled_at', '') is not null then
    begin
      -- The Back Office types Tunisian wall time.
      v_at := (p->>'scheduled_at')::timestamp at time zone 'Africa/Tunis';
    exception when others then
      raise exception 'invalid_video_time' using errcode = 'P0001';
    end;
  end if;
  if v_status = 'confirmed' then
    v_at := coalesce(v_at, v_row.scheduled_at, v_row.preferred_at);
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  update public.video_visit_requests
  set status            = v_status,
      scheduled_at      = coalesce(v_at, scheduled_at),
      staff_note        = coalesce(v_note, staff_note),
      status_changed_at = case when v_status <> status then now() else status_changed_at end,
      status_changed_by = case when v_status <> status then auth.uid() else status_changed_by end
  where id = p_id
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.staff_set_video_visit(uuid, jsonb) from public, anon;
grant execute on function public.staff_set_video_visit(uuid, jsonb) to authenticated;

comment on function public.staff_set_video_visit(uuid, jsonb) is
  'Moves a video visit (0130): status requested | confirmed | done | cancelled, an optional scheduled_at in Tunisian wall time («2026-10-12T14:00»; confirming without one keeps the time the visitor chose) and a staff note. Staff, limited to files they may see. Audited by trigger.';

-- ---------------------------------------------------------------------------
-- The words, in Arabic, with drafts in the four other languages
-- ---------------------------------------------------------------------------

create temp table _abroad_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _abroad_texts values
  -- /abroad
  ('ui.abroad.nav', 1, 'رابط الصفحة في القائمة', 'الكلمة في قائمة الموقع اللي تحلّ صفحة /abroad.',
   'للتوانسة بالخارج', 'Depuis l''étranger', 'Aus dem Ausland', 'Dall''estero', 'From abroad'),
  ('ui.abroad.meta_title', 2, 'عنوان الصفحة في البحث', 'عنوان صفحة /abroad في Google وفي التاب.',
   'زيتونتك في البلاد، وإنت وين ما كنت', 'Votre olivier en Tunisie, où que vous soyez',
   'Ihr Olivenbaum in Tunesien – wo immer Sie leben', 'Il tuo ulivo in Tunisia, ovunque tu sia',
   'Your olive tree in Tunisia, wherever you live'),
  ('ui.abroad.meta_description', 3, 'وصف الصفحة في البحث', 'السطر اللي يظهر تحت العنوان في Google.',
   'زور الضيعة من تلفونك، شوفها مباشرة بالفيديو مع فريقنا، وتابع زيتونتك من وين ما كنت.',
   'Visitez l''oliveraie depuis votre téléphone, voyez-la en direct en vidéo avec notre équipe et suivez votre olivier où que vous soyez.',
   'Besuchen Sie den Hain vom Handy aus, sehen Sie ihn live per Video mit unserem Team und verfolgen Sie Ihren Baum, wo immer Sie sind.',
   'Visita l''uliveto dal telefono, guardalo in diretta video con il nostro team e segui il tuo ulivo ovunque tu sia.',
   'Visit the grove from your phone, see it live on video with our team, and follow your tree from wherever you are.'),
  ('ui.abroad.eyebrow', 4, 'الكلمة الصغيرة فوق العنوان', 'فوق العنوان الكبير في أعلى الصفحة.',
   'للتوانسة اللي برّا', 'Pour les Tunisiens de l''étranger', 'Für Tunesier im Ausland', 'Per i tunisini all''estero',
   'For Tunisians abroad'),
  ('ui.abroad.title', 5, 'العنوان الكبير', 'أوّل جملة في الصفحة.',
   'إنت بعيد، وزيتونتك في البلاد', 'Vous êtes loin. Votre olivier est au pays.',
   'Sie sind weit weg. Ihr Olivenbaum ist zu Hause.', 'Tu sei lontano. Il tuo ulivo è a casa.',
   'You''re far away. Your olive tree is back home.'),
  ('ui.abroad.lead', 6, 'الجملة تحت العنوان', 'تحت العنوان الكبير.',
   'من باريس ولا ميلانو ولا مونتريال: زور الضيعة من تلفونك، شوفها مباشرة بالفيديو مع واحد من فريقنا، وتابع زيتونتك وهي تكبر — كأنك غادي.',
   'De Paris, Milan ou Montréal : visitez l''oliveraie depuis votre téléphone, voyez-la en direct en vidéo avec un membre de notre équipe, et regardez votre olivier grandir — comme si vous y étiez.',
   'Ob aus Paris, Mailand oder Montreal: Besuchen Sie den Hain vom Handy aus, sehen Sie ihn live per Video mit jemandem aus unserem Team und verfolgen Sie, wie Ihr Baum wächst – als wären Sie dort.',
   'Da Parigi, Milano o Montréal: visita l''uliveto dal telefono, guardalo in diretta video con qualcuno del nostro team e segui il tuo ulivo mentre cresce — come se fossi lì.',
   'From Paris, Milan or Montreal: visit the grove from your phone, see it live on video with someone from our team, and watch your tree grow — as if you were there.'),
  ('ui.abroad.cta_tour', 7, 'زر الزيارة الافتراضية', 'الزر الأوّل في أعلى الصفحة.',
   'زور ضيعة توّا', 'Visiter une oliveraie', 'Einen Hain besuchen', 'Visita un uliveto', 'Visit a grove now'),
  ('ui.abroad.cta_live', 8, 'زر الزيارة بالفيديو', 'الزر الثاني في أعلى الصفحة، ينزل للفورم.',
   'احجز زيارة بالفيديو', 'Réserver une visite vidéo', 'Videobesuch buchen', 'Prenota una visita video',
   'Book a video visit'),
  ('ui.abroad.clock_tunis', 9, 'الساعة في تونس', 'فوق الساعة اللي تبيّن الوقت توّا في تونس.',
   'توّا في تونس', 'En Tunisie', 'In Tunesien', 'In Tunisia', 'In Tunisia'),
  ('ui.abroad.clock_you', 10, 'الساعة عند الزائر', 'فوق الساعة اللي تبيّن الوقت توّا عند الزائر.',
   'توّا عندك', 'Chez vous', 'Bei Ihnen', 'Da te', 'Where you are'),
  ('ui.abroad.clock_note', 11, 'تحت الساعتين', 'جملة صغيرة تحت الساعتين.',
   'المواعيد تتحسب بالتوقيت متاعك، موش متاعنا.', 'Les horaires s''affichent à votre heure, pas à la nôtre.',
   'Termine werden in Ihrer Ortszeit angezeigt, nicht in unserer.',
   'Gli orari sono mostrati nella tua ora locale, non nella nostra.', 'Times are shown in your local time, not ours.'),
  ('ui.abroad.tour_title', 12, 'عنوان قسم الزيارة الافتراضية', 'فوق بطاقات العروض.',
   'زيارة افتراضية: امشي في الضيعة من تلفونك', 'Visite virtuelle : parcourez l''oliveraie depuis votre téléphone',
   'Virtueller Rundgang: durch den Hain – vom Handy aus', 'Visita virtuale: cammina nell''uliveto dal telefono',
   'Virtual visit: walk the grove from your phone'),
  ('ui.abroad.tour_text', 13, 'شرح الزيارة الافتراضية', 'تحت عنوان القسم.',
   'كل عرض عندو زيارتو: التصاور، الأرض والماء، الزيتون، والبلاصة بالضبط على الخريطة.',
   'Chaque offre a sa visite : les photos, la terre et l''eau, les oliviers et l''emplacement exact sur la carte.',
   'Jedes Angebot hat seinen Rundgang: Fotos, Boden und Wasser, die Bäume und der genaue Ort auf der Karte.',
   'Ogni offerta ha la sua visita: le foto, la terra e l''acqua, gli ulivi e il punto esatto sulla mappa.',
   'Every offer has its own visit: the photos, the land and water, the trees, and the exact spot on the map.'),
  ('ui.abroad.tour_cta', 14, 'زر «ابدا الزيارة»', 'على كل بطاقة عرض.',
   'ابدا الزيارة', 'Commencer la visite', 'Rundgang starten', 'Inizia la visita', 'Start the visit'),
  ('ui.abroad.live_title', 15, 'عنوان قسم الفيديو', 'فوق شرح الزيارة بالفيديو والفورم.',
   'زيارة مباشرة بالفيديو', 'Une visite en direct, en vidéo', 'Live-Besuch per Video', 'Visita dal vivo in video',
   'A live video visit'),
  ('ui.abroad.live_text', 16, 'شرح الزيارة بالفيديو', 'تحت عنوان القسم.',
   'واحد من فريقنا يهزّ التلفون ويمشي بيك بين الزيتون: يوريك الأرض والماء والطريق، ويجاوبك على كل سؤال، في مكالمة فيديو على واتساب.',
   'Un membre de notre équipe prend son téléphone et marche avec vous entre les oliviers : il vous montre la terre, l''eau et le chemin, et répond à toutes vos questions, en appel vidéo WhatsApp.',
   'Jemand aus unserem Team nimmt das Handy und geht mit Ihnen durch die Bäume: Boden, Wasser, Zufahrt – und beantwortet jede Frage, im WhatsApp-Videoanruf.',
   'Qualcuno del nostro team prende il telefono e cammina con te tra gli ulivi: ti mostra la terra, l''acqua e la strada, e risponde a ogni domanda, in videochiamata WhatsApp.',
   'Someone from our team picks up the phone and walks you through the trees: the land, the water, the road — and answers every question, on a WhatsApp video call.'),
  ('ui.abroad.live_point_time', 17, 'نقطة: الوقت', 'أوّل نقطة تحت شرح الزيارة بالفيديو.',
   'في الوقت اللي يناسبك، بالتوقيت متاعك', 'Au moment qui vous convient, à votre heure',
   'Wann es Ihnen passt, in Ihrer Ortszeit', 'Quando ti fa comodo, alla tua ora', 'When it suits you, in your time zone'),
  ('ui.abroad.live_point_length', 18, 'نقطة: المدة', 'ثاني نقطة. {minutes} تتبدّل بالإعداد abroad.video_minutes.',
   'قرابة {minutes} دقيقة على واتساب', 'Environ {minutes} minutes sur WhatsApp', 'Etwa {minutes} Minuten über WhatsApp',
   'Circa {minutes} minuti su WhatsApp', 'About {minutes} minutes on WhatsApp'),
  ('ui.abroad.live_point_family', 19, 'نقطة: العايلة', 'ثالث نقطة.',
   'العايلة تنجم تتفرّج معاك', 'La famille peut regarder avec vous', 'Die Familie kann mitschauen',
   'La famiglia può guardare con te', 'Your family can watch with you'),
  ('ui.abroad.form_title', 20, 'عنوان الفورم', 'فوق خانات حجز الزيارة بالفيديو.',
   'اختار موعدك', 'Choisissez votre créneau', 'Wählen Sie Ihren Termin', 'Scegli il tuo orario', 'Pick your time'),
  ('ui.abroad.name_label', 21, 'خانة الاسم', 'في الفورم.',
   'الاسم واللقب', 'Nom et prénom', 'Vor- und Nachname', 'Nome e cognome', 'Full name'),
  ('ui.abroad.whatsapp_label', 22, 'خانة الواتساب', 'في الفورم.',
   'نومرو الواتساب', 'Numéro WhatsApp', 'WhatsApp-Nummer', 'Numero WhatsApp', 'WhatsApp number'),
  ('ui.abroad.whatsapp_hint', 23, 'تحت خانة الواتساب', 'مثال على نومرو بالرمز الدولي.',
   'بالرمز متاع البلاد اللي إنت فيها، كيما ‎+33 6 12 34 56 78', 'Avec l''indicatif de votre pays, par ex. +33 6 12 34 56 78',
   'Mit Ländervorwahl, z. B. +49 151 23456789', 'Con il prefisso del tuo paese, es. +39 312 345 6789',
   'With your country code, e.g. +44 7700 900123'),
  ('ui.abroad.offer_label', 24, 'خانة العرض', 'في الفورم: الضيعة اللي يحب يشوفها.',
   'شنوّة الضيعة اللي تحب تشوف؟', 'Quelle oliveraie voulez-vous voir ?', 'Welchen Hain möchten Sie sehen?',
   'Quale uliveto vuoi vedere?', 'Which grove would you like to see?'),
  ('ui.abroad.offer_any', 25, 'خيار «مازلت ما اخترتش»', 'أوّل خيار في قائمة العروض.',
   'مازلت ما اخترتش، وريوني اللي عندكم', 'Je n''ai pas encore choisi : montrez-moi',
   'Noch nicht entschieden – zeigen Sie mir, was es gibt', 'Non ho ancora scelto: mostratemi', 'I haven''t chosen yet — show me'),
  ('ui.abroad.day_label', 26, 'خانة النهار', 'في الفورم.',
   'النهار', 'Le jour', 'Tag', 'Giorno', 'Day'),
  ('ui.abroad.time_label', 27, 'خانة الوقت', 'في الفورم: الأوقات تظهر بتوقيت الزائر.',
   'الوقت، بالتوقيت متاعك', 'L''heure, à votre heure locale', 'Uhrzeit, in Ihrer Ortszeit', 'Ora, nella tua ora locale',
   'Time, in your local time'),
  ('ui.abroad.time_tunis', 28, 'الوقت في تونس تحت كل موعد', '{time} تتبدّل بالساعة في تونس.',
   '{time} في تونس', '{time} en Tunisie', '{time} in Tunesien', '{time} in Tunisia', '{time} in Tunisia'),
  ('ui.abroad.next_day', 29, 'علامة «النهار اللي بعدو»', 'كي الموعد يطيح عند الزائر في النهار اللي بعدو.',
   'الغدوة', 'le lendemain', 'am Folgetag', 'il giorno dopo', 'next day'),
  ('ui.abroad.slot_taken', 30, 'موعد محجوز', 'على الوقت اللي تعبّى.',
   'محجوز', 'Pris', 'Vergeben', 'Occupato', 'Taken'),
  ('ui.abroad.no_slots', 31, 'ما فماش مواعيد', 'كي المواعيد الكل محجوزة ولا مسكّرة.',
   'ما فماش مواعيد فارغة في الأيام الجاية. ابعثلنا على واتساب ونلقاو وقت.',
   'Aucun créneau libre dans les prochains jours. Écrivez-nous sur WhatsApp et nous trouverons un moment.',
   'In den nächsten Tagen ist nichts frei. Schreiben Sie uns auf WhatsApp, wir finden einen Termin.',
   'Nessun orario libero nei prossimi giorni. Scrivici su WhatsApp e troveremo un momento.',
   'No free times in the coming days. Message us on WhatsApp and we''ll find one.'),
  ('ui.abroad.note_label', 32, 'خانة الملاحظة', 'في الفورم.',
   'حاجة تحب نوريوهالك؟ (اختياري)', 'Quelque chose à voir en particulier ? (facultatif)',
   'Etwas Bestimmtes, das Sie sehen möchten? (optional)', 'Qualcosa in particolare da vedere? (facoltativo)',
   'Anything you''d like us to show you? (optional)'),
  ('ui.abroad.note_placeholder', 33, 'مثال في خانة الملاحظة', 'يظهر رمادي في الخانة الفارغة.',
   'الماء، الطريق، زيتونة بعينها…', 'L''eau, le chemin, un arbre en particulier…',
   'Wasser, Zufahrt, ein bestimmter Baum …', 'L''acqua, la strada, un albero in particolare…',
   'The water, the road, one particular tree…'),
  ('ui.abroad.submit', 34, 'زر الحجز', 'آخر الفورم.',
   'احجز الزيارة بالفيديو', 'Réserver la visite vidéo', 'Videobesuch buchen', 'Prenota la visita video', 'Book the video visit'),
  ('ui.abroad.pending', 35, 'الزر وقت الإرسال', 'يظهر في بلاصة الزر وقت الإرسال.',
   'قاعد نبعث…', 'Envoi…', 'Wird gesendet …', 'Invio…', 'Sending…'),
  ('ui.abroad.done_title', 36, 'عنوان «وصل طلبك»', 'بعد الحجز.',
   'وصل طلبك! نتلاقاو في الضيعة', 'C''est noté ! Rendez-vous à l''oliveraie', 'Angekommen! Wir sehen uns im Hain',
   'Ricevuto! Ci vediamo nell''uliveto', 'Got it! See you in the grove'),
  ('ui.abroad.done_text', 37, 'شرح «وصل طلبك»', '{when} = الموعد بتوقيت الزائر، {no} = رقم الطلب.',
   'باش نكتبولك على واتساب باش نأكّدو الموعد: {when} بالتوقيت متاعك. رقم الطلب {no}.',
   'Nous vous écrivons sur WhatsApp pour confirmer : {when}, à votre heure. Référence {no}.',
   'Wir schreiben Ihnen auf WhatsApp zur Bestätigung: {when}, Ihre Ortszeit. Referenz {no}.',
   'Ti scriviamo su WhatsApp per confermare: {when}, ora locale. Riferimento {no}.',
   'We''ll message you on WhatsApp to confirm: {when}, your time. Reference {no}.'),
  ('ui.abroad.error_name', 38, 'غلطة: الاسم', 'كي الاسم ناقص.',
   'اكتب الاسم واللقب كاملين.', 'Écrivez votre nom et votre prénom.', 'Bitte geben Sie Vor- und Nachnamen ein.',
   'Scrivi nome e cognome.', 'Please write your first and last name.'),
  ('ui.abroad.error_whatsapp', 39, 'غلطة: الواتساب', 'كي النومرو موش صحيح.',
   'نومرو الواتساب موش صحيح. اكتبو بالرمز الدولي، كيما ‎+33 6 12 34 56 78.',
   'Ce numéro WhatsApp n''est pas valide. Écrivez-le avec l''indicatif, par ex. +33 6 12 34 56 78.',
   'Diese WhatsApp-Nummer ist ungültig. Bitte mit Ländervorwahl, z. B. +49 151 23456789.',
   'Questo numero WhatsApp non è valido. Scrivilo con il prefisso, es. +39 312 345 6789.',
   'That WhatsApp number isn''t valid. Write it with the country code, e.g. +44 7700 900123.'),
  ('ui.abroad.error_slot', 40, 'غلطة: الموعد', 'كي الموعد تعبّى ولا ما عادش متاح.',
   'الموعد هذا ما عادش متاح. اختار وقت آخر.', 'Ce créneau n''est plus disponible. Choisissez-en un autre.',
   'Dieser Termin ist nicht mehr frei. Bitte wählen Sie einen anderen.',
   'Questo orario non è più disponibile. Scegline un altro.', 'That time is no longer available. Please pick another.'),
  ('ui.abroad.error_consent', 41, 'غلطة: الموافقة', 'كي الزائر ما وافقش.',
   'باش نبعثو الطلب، وافق على التواصل ومعالجة معطياتك.',
   'Pour envoyer la demande, acceptez d''être contacté et le traitement de vos données.',
   'Um die Anfrage zu senden, stimmen Sie bitte der Kontaktaufnahme und Datenverarbeitung zu.',
   'Per inviare la richiesta, accetta di essere contattato e il trattamento dei tuoi dati.',
   'To send the request, please agree to be contacted and to the processing of your data.'),
  ('ui.abroad.error_limit', 42, 'غلطة: برشا طلبات', 'كي يوصل حد الطلبات.',
   'وصلتنا برشا طلبات من نفس النومرو ولا نفس الجهاز. عاود بعد ساعة، ولا ابعثلنا على واتساب.',
   'Trop de demandes depuis ce numéro ou cet appareil. Réessayez dans une heure, ou écrivez-nous sur WhatsApp.',
   'Zu viele Anfragen von dieser Nummer oder diesem Gerät. Versuchen Sie es in einer Stunde erneut oder schreiben Sie uns auf WhatsApp.',
   'Troppe richieste da questo numero o dispositivo. Riprova tra un''ora, o scrivici su WhatsApp.',
   'Too many requests from this number or device. Try again in an hour, or message us on WhatsApp.'),
  ('ui.abroad.error_closed', 43, 'غلطة: الحجز مسكّر', 'كي الموديول مسكّر.',
   'الحجز بالفيديو مسكّر توّا. ابعثلنا على واتساب ونلقاو حل.',
   'La réservation vidéo est fermée pour le moment. Écrivez-nous sur WhatsApp.',
   'Videobesuche können gerade nicht gebucht werden. Schreiben Sie uns auf WhatsApp.',
   'Le visite video non sono prenotabili ora. Scrivici su WhatsApp.',
   'Video visits can''t be booked right now. Message us on WhatsApp.'),
  ('ui.abroad.error_generic', 44, 'غلطة: عامة', 'كي يصير مشكل آخر.',
   'صار مشكل وما بعثناش الطلب. عاود، ولا ابعثلنا على واتساب.',
   'Un problème est survenu et la demande n''est pas partie. Réessayez, ou écrivez-nous sur WhatsApp.',
   'Etwas ist schiefgelaufen, die Anfrage wurde nicht gesendet. Bitte erneut versuchen oder auf WhatsApp schreiben.',
   'Qualcosa è andato storto e la richiesta non è partita. Riprova o scrivici su WhatsApp.',
   'Something went wrong and the request wasn''t sent. Try again, or message us on WhatsApp.'),
  ('ui.abroad.steps_title', 45, 'عنوان قسم المراحل', 'فوق المراحل الأربعة.',
   'كل شي ينجم يصير وإنت برّا', 'Tout peut se faire depuis l''étranger', 'Alles geht auch aus dem Ausland',
   'Tutto si può fare dall''estero', 'Everything can be done from abroad'),
  ('ui.abroad.step_choose_title', 46, 'مرحلة 1: العنوان', 'فرّغها باش تخبّي المرحلة.',
   'تختار', 'Choisir', 'Auswählen', 'Scegliere', 'Choose'),
  ('ui.abroad.step_choose_text', 47, 'مرحلة 1: الشرح', '',
   'تشوف العروض وتزور الضيعة افتراضياً ولا بالفيديو مع فريقنا.',
   'Parcourez les offres et visitez l''oliveraie en virtuel ou en vidéo avec notre équipe.',
   'Sehen Sie die Angebote an und besuchen Sie den Hain virtuell oder per Video mit unserem Team.',
   'Guarda le offerte e visita l''uliveto in virtuale o in video con il nostro team.',
   'Browse the offers and visit the grove virtually or on video with our team.'),
  ('ui.abroad.step_book_title', 48, 'مرحلة 2: العنوان', 'فرّغها باش تخبّي المرحلة.',
   'تحجز', 'Réserver', 'Reservieren', 'Prenotare', 'Reserve'),
  ('ui.abroad.step_book_text', 49, 'مرحلة 2: الشرح', '',
   'تبعث طلبك من هنا، وكل شي يكمل معاك على واتساب، بالتوقيت متاعك.',
   'Envoyez votre demande d''ici ; tout se poursuit sur WhatsApp, à votre heure.',
   'Senden Sie Ihre Anfrage von hier; alles Weitere läuft über WhatsApp, in Ihrer Ortszeit.',
   'Invia la richiesta da qui; tutto il resto continua su WhatsApp, alla tua ora.',
   'Send your request from here; everything else carries on over WhatsApp, in your time.'),
  ('ui.abroad.step_sign_title', 50, 'مرحلة 3: العنوان', 'فرّغها باش تخبّي المرحلة.',
   'تمضي', 'Signer', 'Unterschreiben', 'Firmare', 'Sign'),
  ('ui.abroad.step_sign_text', 51, 'مرحلة 3: الشرح', 'راجعها: لازم تطابق اللي تعملو فعلاً.',
   'في الصيف كي تروّح نمضيو مع بعضنا، ولا بتوكيل من القنصلية إذا ما تنجمش تجي.',
   'L''été, quand vous rentrez, nous signons ensemble — ou par procuration consulaire si vous ne pouvez pas venir.',
   'Im Sommer, wenn Sie nach Hause kommen, unterschreiben wir gemeinsam – oder per konsularischer Vollmacht.',
   'D''estate, quando torni, firmiamo insieme — oppure con una procura consolare se non puoi venire.',
   'In summer, when you''re home, we sign together — or by consular power of attorney if you can''t come.'),
  ('ui.abroad.step_follow_title', 52, 'مرحلة 4: العنوان', 'فرّغها باش تخبّي المرحلة.',
   'تتابع', 'Suivre', 'Verfolgen', 'Seguire', 'Follow'),
  ('ui.abroad.step_follow_text', 53, 'مرحلة 4: الشرح', '',
   'في «زيتونتي» تشوف زيتونتك وأخبارها، وين ما كنت.',
   'Dans « Zitounti », retrouvez votre olivier et ses nouvelles, où que vous soyez.',
   'In „Zitounti“ sehen Sie Ihren Baum und seine Neuigkeiten, wo immer Sie sind.',
   'In «Zitounti» trovi il tuo ulivo e le sue novità, ovunque tu sia.',
   'In “Zitounti” you see your tree and its news, wherever you are.'),
  ('ui.abroad.summer_title', 54, 'عنوان «جاي في الصيف؟»', 'القسم اللي يدعي الزائر للضيعة كي يروّح.',
   'جاي في الصيف؟', 'Vous rentrez cet été ?', 'Kommen Sie im Sommer?', 'Torni quest''estate?', 'Coming home this summer?'),
  ('ui.abroad.summer_text', 55, 'شرح «جاي في الصيف؟»', '',
   'قلّنا وقتاش تكون في تونس ونستناوك في الضيعة: تشوف زيتونتك بعينيك وتعرّف بيها العايلة.',
   'Dites-nous quand vous serez en Tunisie et nous vous attendrons à l''oliveraie : voyez votre olivier de vos yeux et présentez-le à la famille.',
   'Sagen Sie uns, wann Sie in Tunesien sind – wir erwarten Sie im Hain: Sehen Sie Ihren Baum mit eigenen Augen und zeigen Sie ihn der Familie.',
   'Dicci quando sarai in Tunisia e ti aspettiamo all''uliveto: vedi il tuo ulivo con i tuoi occhi e presentalo alla famiglia.',
   'Tell us when you''ll be in Tunisia and we''ll meet you at the grove: see your tree with your own eyes and introduce it to the family.'),
  ('ui.abroad.summer_cta', 56, 'زر «جاي في الصيف؟»', 'يحلّ العروض: الزيارة في الضيعة تتطلب من فورم العرض.',
   'اختار ضيعة واطلب زيارة', 'Choisir une oliveraie et demander une visite', 'Hain wählen und Besuch anfragen',
   'Scegli un uliveto e chiedi una visita', 'Pick a grove and ask for a visit'),
  ('ui.abroad.contact_title', 57, 'عنوان «عندك سؤال؟»', 'آخر الصفحة.',
   'عندك سؤال؟', 'Une question ?', 'Eine Frage?', 'Una domanda?', 'A question?'),
  ('ui.abroad.contact_text', 58, 'شرح «عندك سؤال؟»', '',
   'احكي معانا على واتساب ولا بالتلفون، وين ما كنت.', 'Parlez-nous sur WhatsApp ou par téléphone, où que vous soyez.',
   'Sprechen Sie mit uns über WhatsApp oder telefonisch, wo immer Sie sind.',
   'Parlaci su WhatsApp o al telefono, ovunque tu sia.', 'Talk to us on WhatsApp or by phone, wherever you are.'),
  ('ui.abroad.contact_cta', 59, 'زر «احكي معانا»', 'يحلّ الاختيار بين مكالمة وواتساب.',
   'احكي معانا', 'Nous parler', 'Mit uns sprechen', 'Parla con noi', 'Talk to us'),
  ('ui.abroad.home_title', 60, 'عنوان البطاقة في الرئيسية', 'البطاقة اللي تدعي اللي برّا لصفحتهم.',
   'عايش برّا تونس؟', 'Vous vivez hors de Tunisie ?', 'Sie leben außerhalb Tunesiens?', 'Vivi fuori dalla Tunisia?',
   'Living outside Tunisia?'),
  ('ui.abroad.home_text', 61, 'شرح البطاقة في الرئيسية', '',
   'زور الضيعة من تلفونك، ولا شوفها مباشرة بالفيديو مع فريقنا، في الوقت اللي يناسبك.',
   'Visitez l''oliveraie depuis votre téléphone, ou voyez-la en direct en vidéo avec notre équipe, quand cela vous convient.',
   'Besuchen Sie den Hain vom Handy aus oder sehen Sie ihn live per Video mit unserem Team – wann es Ihnen passt.',
   'Visita l''uliveto dal telefono, o guardalo in diretta video con il nostro team, quando ti fa comodo.',
   'Visit the grove from your phone, or see it live on video with our team, whenever suits you.'),
  ('ui.abroad.home_cta', 62, 'زر البطاقة في الرئيسية', '',
   'اكتشف كيفاش', 'Découvrir', 'Mehr erfahren', 'Scopri come', 'See how'),
  -- /projects/<code>/visit
  ('ui.tour.open', 70, 'زر الزيارة الافتراضية', 'على صورة كل عرض: يحلّ الزيارة الافتراضية.',
   'زيارة افتراضية', 'Visite virtuelle', 'Virtueller Rundgang', 'Visita virtuale', 'Virtual visit'),
  ('ui.tour.welcome', 71, 'أوّل شاشة في الزيارة', '{name} = اسم العرض.',
   'مرحبا بيك في {name}', 'Bienvenue à {name}', 'Willkommen in {name}', 'Benvenuto a {name}', 'Welcome to {name}'),
  ('ui.tour.now_here', 72, 'الساعة في الضيعة', 'في أوّل شاشة. {time} = الساعة توّا في تونس.',
   'الساعة توّا في الضيعة {time}', 'Il est {time} à l''oliveraie', 'Im Hain ist es jetzt {time}',
   'All''uliveto sono le {time}', 'It''s {time} at the grove'),
  ('ui.tour.land_title', 73, 'شاشة الأرض', 'عنوان الشاشة اللي فيها المساحة والماء.',
   'الأرض', 'La terre', 'Das Land', 'La terra', 'The land'),
  ('ui.tour.trees_title', 74, 'شاشة الزيتون', 'عنوان الشاشة اللي فيها الصنف والعمر.',
   'الزيتون', 'Les oliviers', 'Die Olivenbäume', 'Gli ulivi', 'The olive trees'),
  ('ui.tour.map_title', 75, 'شاشة الخريطة', 'عنوان الشاشة اللي فيها صورة القمر الصناعي.',
   'وين بالضبط؟', 'Où exactement ?', 'Wo genau?', 'Dove esattamente?', 'Where exactly?'),
  ('ui.tour.map_open', 76, 'زر الخريطة', 'يحلّ البلاصة في خرائط Google.',
   'حلّ الخريطة', 'Ouvrir la carte', 'Karte öffnen', 'Apri la mappa', 'Open the map'),
  ('ui.tour.end_title', 77, 'آخر شاشة: العنوان', '',
   'عجبتك الضيعة؟', 'Elle vous plaît ?', 'Gefällt er Ihnen?', 'Ti piace?', 'Do you like it?'),
  ('ui.tour.end_text', 78, 'آخر شاشة: الشرح', '',
   'شوفها مباشرة: واحد من فريقنا يمشي بيك بين الزيتون في مكالمة فيديو، في الوقت اللي يناسبك وين ما كنت.',
   'Voyez-la en direct : un membre de notre équipe vous fait marcher entre les oliviers en appel vidéo, au moment qui vous convient, où que vous soyez.',
   'Sehen Sie ihn live: Jemand aus unserem Team führt Sie per Videoanruf durch die Bäume – wann es Ihnen passt, wo immer Sie sind.',
   'Guardalo dal vivo: qualcuno del nostro team ti porta tra gli ulivi in videochiamata, quando ti fa comodo, ovunque tu sia.',
   'See it live: someone from our team walks you through the trees on a video call, whenever suits you, wherever you are.'),
  ('ui.tour.end_live', 79, 'آخر شاشة: زر الفيديو', '',
   'زيارة مباشرة بالفيديو', 'Visite en direct en vidéo', 'Live-Besuch per Video', 'Visita dal vivo in video', 'Live video visit'),
  ('ui.tour.end_back', 80, 'آخر شاشة: زر الرجوع', '',
   'ارجع للعرض', 'Retour à l''offre', 'Zurück zum Angebot', 'Torna all''offerta', 'Back to the offer'),
  ('ui.tour.next', 81, 'زر «اللي بعدو»', 'يقراه قارئ الشاشة.',
   'اللي بعدو', 'Suivant', 'Weiter', 'Avanti', 'Next'),
  ('ui.tour.prev', 82, 'زر «اللي قبلو»', 'يقراه قارئ الشاشة.',
   'اللي قبلو', 'Précédent', 'Zurück', 'Indietro', 'Previous'),
  ('ui.tour.pause', 83, 'زر «وقّف»', 'يوقّف المرور الأوتوماتيكي.',
   'وقّف', 'Pause', 'Pause', 'Pausa', 'Pause'),
  ('ui.tour.play', 84, 'زر «كمّل»', 'يرجّع المرور الأوتوماتيكي.',
   'كمّل', 'Lecture', 'Fortsetzen', 'Riprendi', 'Play'),
  ('ui.tour.close', 85, 'زر السكّير', 'يسكّر الزيارة ويرجع للعرض.',
   'سكّر الزيارة', 'Fermer la visite', 'Rundgang schließen', 'Chiudi la visita', 'Close the visit'),
  ('ui.tour.hint', 86, 'تلميح أوّل شاشة', 'يظهر في أوّل شاشة برك.',
   'اضغط على الطرف باش تتقدّم', 'Touchez le bord pour avancer', 'Tippen Sie auf den Rand, um weiterzugehen',
   'Tocca il bordo per andare avanti', 'Tap the edge to move on');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 600 + sort
from _abroad_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _abroad_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
