-- 0176 · «قصص النجاح» — every client's story with us, and the photos and videos that will tell it.
--
-- Its test is supabase/tests/121_success_stories.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0176_success_stories.sql supabase/tests/121_success_stories.sql
--
-- THE OWNER, 2026-11-19: «كل كليون خذا وكل كليون شاف، عنده قصة معانا … نكتبوها من نهار اللي تكلم وباع ومشى
-- وعمل وشاف، كيما السكسس ستوري». Then: «ينجم ينزل فيديو، صور، فيديو … باش من بعد كي تاخوها تمنتجها ولا نعطيوها
-- لشكون يمنتجها، تخرج لنا قصة حقيقية بعباتها بناسها، مش كان أرقام … كل فيديو يتبرمج كقصة نجاح بالطبيعة بعد ما
-- يسمح لنا هو انه ننشروه … نزيدوها في الشروط».
--
-- THE STORY ITSELF IS NOT STORED. Everything that happened — the demand, the calls, the visit, the trees, the
-- deposit, the contract, ownership — is already in its own table, and app.journey_timeline (0090) reads it.
-- app.story_milestones below picks the moments a client would tell, once each, for his own page; the staff page
-- reads the whole timeline. What is new is only what did not exist: the client's photos and videos, his
-- permission to publish, and the team's work on the story (the text, the montage, where it was published).
--
-- PERMISSION IS EXPLICIT AND CAN BE TAKEN BACK. A story is published only when success_stories.consent is
-- 'granted' — enforced by a CHECK, so no screen can publish without it. The client gives it himself (a box he
-- ticks, never ticked for him, with the exact sentence he read kept beside it) or the team records one he gave
-- on paper or WhatsApp, with a note saying how. He withdraws it from his space with one press. The privacy page
-- says all this in its five languages (§6).
--
-- VIDEOS ARE STORED IN PARTS. The project's storage takes at most 50 MB per file and a minute of phone video is
-- more. A file is cut in the browser into parts of settings story.part_mb and sent straight to the private
-- bucket story-media with one-time tokens (the land-offer upload, 0003). The bytes are untouched: joining the
-- parts in order gives back the exact file, which is what the staff page does to play or download it.

-- ---------------------------------------------------------------------------
-- 1 · Where the files go
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-media', 'story-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No policy on storage.objects for this bucket: only the service role reads or writes it, after the server has
-- checked who is asking (the client's session, or a staff role and app.can_see_person).

-- ---------------------------------------------------------------------------
-- 2 · The story and its media
-- ---------------------------------------------------------------------------

create table if not exists public.success_stories (
  person_id      uuid primary key references public.persons (id) on delete cascade,
  status         text not null default 'collecting'
                 check (status in ('collecting', 'editing', 'ready', 'published', 'withdrawn')),
  consent        text not null default 'none' check (consent in ('none', 'granted', 'withdrawn')),
  consent_at     timestamptz,
  consent_source text check (consent_source in ('client', 'staff')),
  consent_text   text check (char_length(consent_text) <= 600),
  consent_note   text check (char_length(consent_note) <= 300),
  title          text check (char_length(title) <= 120),
  story_text     text check (char_length(story_text) <= 4000),
  published_url  text check (published_url is null or published_url ~ '^https://'),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id),
  constraint success_stories_publish_needs_consent check (status not in ('ready', 'published') or consent = 'granted')
);

comment on table public.success_stories is
  '«قصص النجاح» (0176): the team''s work on one client''s story and his permission to publish it. The events themselves are read from their own tables (app.journey_timeline).';

create table if not exists public.story_media (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons (id) on delete cascade,
  source      text not null check (source in ('client', 'staff')),
  role        text not null default 'raw' check (role in ('raw', 'final')),
  kind        text not null check (kind in ('photo', 'video')),
  mime        text not null,
  file_name   text check (char_length(file_name) <= 200),
  size_bytes  bigint not null check (size_bytes > 0),
  parts       integer not null default 1 check (parts between 1 and 40),
  path        text not null unique,
  caption     text check (char_length(caption) <= 300),
  status      text not null default 'uploading' check (status in ('uploading', 'ready', 'kept', 'set_aside')),
  uploaded_by uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  ready_at    timestamptz,
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles (id)
);

comment on table public.story_media is
  '0176: one photo or video for a client''s story. Stored in bucket story-media as <path>/001, <path>/002… — the parts of the original file, joined in order.';

create index if not exists story_media_person on public.story_media (person_id, created_at desc) where deleted_at is null;

alter table public.success_stories enable row level security;
alter table public.story_media     enable row level security;
revoke all on public.success_stories, public.story_media from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Figures and words
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('story.part_mb', to_jsonb(45), 'integer', 'story', 'قصص النجاح: حجم كل جزء من الفيديو (ميغا)',
   'التخزين يقبل 50 ميغا للملف، والفيديو يتقسم أجزاء على هذا القدّ.', false, 10),
  ('story.max_video_mb', to_jsonb(600), 'integer', 'story', 'قصص النجاح: أكبر فيديو (ميغا)', null, false, 11),
  ('story.max_photo_mb', to_jsonb(20), 'integer', 'story', 'قصص النجاح: أكبر تصويرة (ميغا)', null, false, 12),
  ('story.max_uploads_per_day', to_jsonb(30), 'integer', 'story', 'قصص النجاح: أقصى عدد ملفات في النهار للحريف', null, false, 13)
on conflict (key) do nothing;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('zitounti.story_title', 'قصّتي مع AgriZed', 'Mon histoire avec AgriZed', 'Meine Geschichte mit AgriZed', 'La mia storia con AgriZed', 'My story with AgriZed'),
      ('ui.story.intro',
       'من أوّل كلمة حتى زيتونتك: هاذي قصّتك معانا. ابعثلنا تصاورك وفيديواتك، وإذا تحبّ نحكيوها للناس كقصة نجاح.',
       'Du premier mot jusqu''à votre olivier : voici votre histoire avec nous. Envoyez-nous vos photos et vidéos et, si vous le souhaitez, nous la raconterons comme une histoire de réussite.',
       'Vom ersten Wort bis zu Ihrem Olivenbaum: das ist Ihre Geschichte mit uns. Schicken Sie uns Ihre Fotos und Videos – und wenn Sie möchten, erzählen wir sie als Erfolgsgeschichte.',
       'Dalla prima parola al tuo olivo: ecco la tua storia con noi. Mandaci le tue foto e i tuoi video e, se vuoi, la racconteremo come una storia di successo.',
       'From the first word to your olive tree: this is your story with us. Send us your photos and videos and, if you wish, we will tell it as a success story.'),
      ('ui.story.road_title', 'الطريق اللي مشيناه مع بعضنا', 'Le chemin parcouru ensemble', 'Unser gemeinsamer Weg', 'La strada fatta insieme', 'The road we walked together'),
      ('ui.story.m_request', 'بعثتلنا طلبك', 'Vous nous avez écrit', 'Sie haben uns geschrieben', 'Ci hai scritto', 'You wrote to us'),
      ('ui.story.m_call', 'تكلّمنا', 'Nous nous sommes parlé', 'Wir haben gesprochen', 'Ci siamo parlati', 'We talked'),
      ('ui.story.m_visit', 'زرت الأرض', 'Vous avez visité la terre', 'Sie haben das Land besucht', 'Hai visitato la terra', 'You visited the land'),
      ('ui.story.m_trees', 'اخترت زيتوناتك', 'Vous avez choisi vos oliviers', 'Sie haben Ihre Olivenbäume gewählt', 'Hai scelto i tuoi olivi', 'You chose your olive trees'),
      ('ui.story.m_deposit', 'دفعت العربون', 'Vous avez versé l''acompte', 'Sie haben die Anzahlung geleistet', 'Hai versato l''acconto', 'You paid the deposit'),
      ('ui.story.m_contract', 'أمضينا العقد', 'Nous avons signé le contrat', 'Wir haben den Vertrag unterschrieben', 'Abbiamo firmato il contratto', 'We signed the contract'),
      ('ui.story.m_owner', 'ولّيت مولى زيتونة', 'Vous êtes propriétaire d''oliviers', 'Sie sind Besitzer von Olivenbäumen', 'Sei proprietario di olivi', 'You became an olive tree owner'),
      ('ui.story.m_media', 'بعثتلنا أوّل تصويرة ولا فيديو', 'Votre première photo ou vidéo', 'Ihr erstes Foto oder Video', 'La tua prima foto o video', 'Your first photo or video'),
      ('ui.story.upload_title', 'زيد تصويرة ولا فيديو', 'Ajouter une photo ou une vidéo', 'Foto oder Video hinzufügen', 'Aggiungi una foto o un video', 'Add a photo or a video'),
      ('ui.story.upload_hint',
       'صوّر روحك في الأرض ولا مع عايلتك، ولا احكي بكلامك علاش اخترت زيتونتك. الفيديو الطويل يلزمو شوية وقت باش يتبعث.',
       'Filmez-vous sur la terre ou en famille, ou racontez avec vos mots pourquoi vous avez choisi votre olivier. Une longue vidéo met un peu de temps à partir.',
       'Filmen Sie sich auf dem Land oder mit der Familie, oder erzählen Sie in Ihren Worten, warum Sie Ihren Olivenbaum gewählt haben. Ein langes Video braucht etwas Zeit.',
       'Riprenditi sulla terra o con la famiglia, oppure racconta con parole tue perché hai scelto il tuo olivo. Un video lungo richiede un po'' di tempo.',
       'Film yourself on the land or with your family, or tell in your own words why you chose your olive tree. A long video takes a little while to send.'),
      ('ui.story.pick', 'اختار من تلفونك', 'Choisir sur mon téléphone', 'Auf meinem Handy auswählen', 'Scegli dal telefono', 'Choose from my phone'),
      ('ui.story.caption_label', 'كلمة على التصويرة ولا الفيديو (اختياري)', 'Un mot sur la photo ou la vidéo (facultatif)', 'Ein Wort zum Foto oder Video (optional)', 'Una parola sulla foto o sul video (facoltativo)', 'A word about the photo or video (optional)'),
      ('ui.story.consent_label',
       'نقبل AgriZed تنشر قصّتي مع التصاور والفيديوات اللي نبعثهم، على الموقع وفيسبوك وإنستغرام. ننجم نرجع في كلامي وقت ما نحبّ.',
       'J''accepte qu''AgriZed publie mon histoire avec les photos et vidéos que j''envoie, sur le site, Facebook et Instagram. Je peux retirer mon accord à tout moment.',
       'Ich bin einverstanden, dass AgriZed meine Geschichte mit den Fotos und Videos, die ich sende, auf der Website, Facebook und Instagram veröffentlicht. Ich kann meine Zustimmung jederzeit widerrufen.',
       'Accetto che AgriZed pubblichi la mia storia con le foto e i video che invio, sul sito, su Facebook e Instagram. Posso ritirare il consenso in qualsiasi momento.',
       'I agree that AgriZed may publish my story with the photos and videos I send, on the website, Facebook and Instagram. I can withdraw my agreement at any time.'),
      ('ui.story.send', 'ابعث', 'Envoyer', 'Senden', 'Invia', 'Send'),
      ('ui.story.sending', 'جارٍ البعث… {percent}%', 'Envoi… {percent} %', 'Wird gesendet… {percent} %', 'Invio… {percent}%', 'Sending… {percent}%'),
      ('ui.story.sent', 'وصلنا، يعيشك! 🫒', 'Bien reçu, merci ! 🫒', 'Angekommen, danke! 🫒', 'Ricevuto, grazie! 🫒', 'Received, thank you! 🫒'),
      ('ui.story.failed', 'ما وصلش. ثبّت في الإنترنت وعاود.', 'L''envoi a échoué. Vérifiez votre connexion et réessayez.', 'Das Senden ist fehlgeschlagen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.', 'L''invio non è riuscito. Controlla la connessione e riprova.', 'It did not arrive. Check your connection and try again.'),
      ('ui.story.too_big', 'الملف كبير برشا (أكثر من {max}). صوّر فيديو أقصر.', 'Le fichier est trop lourd (plus de {max}). Filmez une vidéo plus courte.', 'Die Datei ist zu groß (mehr als {max}). Drehen Sie ein kürzeres Video.', 'Il file è troppo grande (oltre {max}). Gira un video più breve.', 'The file is too large (over {max}). Record a shorter video.'),
      ('ui.story.bad_type', 'النوع هذا ما يتقبلش. ابعث تصويرة ولا فيديو.', 'Ce type de fichier n''est pas accepté. Envoyez une photo ou une vidéo.', 'Dieser Dateityp wird nicht angenommen. Senden Sie ein Foto oder Video.', 'Questo tipo di file non è accettato. Invia una foto o un video.', 'This type of file is not accepted. Send a photo or a video.'),
      ('ui.story.too_many', 'بعثت برشا اليوم. عاود غدوة.', 'Vous avez beaucoup envoyé aujourd''hui. Réessayez demain.', 'Sie haben heute viel gesendet. Versuchen Sie es morgen wieder.', 'Hai inviato molto oggi. Riprova domani.', 'You have sent a lot today. Try again tomorrow.'),
      ('ui.story.mine_title', 'اللي بعثتو', 'Ce que vous avez envoyé', 'Was Sie gesendet haben', 'Quello che hai inviato', 'What you have sent'),
      ('ui.story.empty_media', 'مازلت ما بعثت حتى شيء.', 'Vous n''avez encore rien envoyé.', 'Sie haben noch nichts gesendet.', 'Non hai ancora inviato nulla.', 'You have not sent anything yet.'),
      ('ui.story.delete', 'نحّي', 'Retirer', 'Entfernen', 'Rimuovi', 'Remove'),
      ('ui.story.video', 'فيديو', 'Vidéo', 'Video', 'Video', 'Video'),
      ('ui.story.photo', 'تصويرة', 'Photo', 'Foto', 'Foto', 'Photo'),
      ('ui.story.by_team', 'من الفريق', 'Par l''équipe', 'Vom Team', 'Dal team', 'By the team'),
      ('ui.story.consent_title', 'نشر قصّتك', 'Publier votre histoire', 'Ihre Geschichte veröffentlichen', 'Pubblicare la tua storia', 'Publishing your story'),
      ('ui.story.consent_on', 'قبلت تتنشر قصّتك. يعيشك!', 'Vous avez accepté que votre histoire soit publiée. Merci !', 'Sie haben der Veröffentlichung zugestimmt. Danke!', 'Hai accettato che la tua storia sia pubblicata. Grazie!', 'You agreed to your story being published. Thank you!'),
      ('ui.story.consent_off', 'قصّتك ما تتنشرش: تبقى بينك وبين الفريق.', 'Votre histoire n''est pas publiée : elle reste entre vous et l''équipe.', 'Ihre Geschichte wird nicht veröffentlicht: sie bleibt zwischen Ihnen und dem Team.', 'La tua storia non viene pubblicata: resta tra te e il team.', 'Your story is not published: it stays between you and the team.'),
      ('ui.story.consent_give', 'نقبل تتنشر قصّتي', 'J''accepte la publication', 'Ich stimme der Veröffentlichung zu', 'Accetto la pubblicazione', 'I agree to publication'),
      ('ui.story.consent_withdraw', 'نرجع في الموافقة', 'Retirer mon accord', 'Zustimmung widerrufen', 'Ritira il consenso', 'Withdraw my agreement'),
      ('ui.story.entry', 'قصّتي: ابعث تصويرة ولا فيديو', 'Mon histoire : envoyer une photo ou une vidéo', 'Meine Geschichte: Foto oder Video senden', 'La mia storia: invia una foto o un video', 'My story: send a photo or a video')
    ) as v(key, ar, fr, de, it, en)
  loop
    insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
    values (r.key, to_jsonb(r.ar), 'text', case when r.key like 'zitounti.%' then 'zitounti' else 'ui' end,
            'قصّتي: ' || r.key, null, true, 5600)
    on conflict (key) do nothing;
    insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
      ('setting', r.key, 'value', 'fr', to_jsonb(r.fr), true),
      ('setting', r.key, 'value', 'de', to_jsonb(r.de), true),
      ('setting', r.key, 'value', 'it', to_jsonb(r.it), true),
      ('setting', r.key, 'value', 'en', to_jsonb(r.en), true)
    on conflict (entity, entity_key, field, locale) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The moments a client would tell
-- ---------------------------------------------------------------------------

/** Once each, in order: the demand, the first talk, the visit, the trees, the deposit, the contract, ownership, the first picture. */
create or replace function app.story_milestones(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('key', m.key, 'at', m.at, 'detail', m.detail) order by m.at, m.rank), '[]'::jsonb)
  from (
      select 1 as rank, 'request'::text as key,
             (select min(r.created_at) from public.interest_requests r where r.person_id = p_person) as at, null::text as detail
      union all
      select 2, 'call', (select min(a.created_at) from public.contact_attempts a
                          where a.person_id = p_person and a.outcome = 'answered'), null
      union all
      select 3, 'visit', v.at, v.offer
        from (select (x.visit_date::timestamp at time zone 'Africa/Tunis') as at, pj.name as offer
                from public.visits x join public.projects pj on pj.id = x.project_id
               where x.person_id = p_person and x.status = 'completed'
               order by x.visit_date limit 1) v
      union all
      select 4, 'trees', t.at, t.detail
        from (select r.reserved_at as at, r.trees_count::text || ' · ' || pj.name as detail
                from public.reservations r join public.projects pj on pj.id = r.project_id
               where r.person_id = p_person order by r.reserved_at limit 1) t
      union all
      select 5, 'deposit', (select min(r.deposit_paid_at) from public.reservations r
                             where r.person_id = p_person and r.deposit_paid_at is not null
                               and exists (select 1 from public.payments p where p.reservation_id = r.id
                                             and p.kind = 'deposit' and p.voided_at is null)), null
      union all
      select 6, 'contract', (select min(c.signed_on)::timestamp at time zone 'Africa/Tunis' from public.contracts c
                              where c.person_id = p_person and c.signed_on is not null), null
      union all
      select 7, 'owner', (select min(c.owned_at) from public.contracts c where c.person_id = p_person), null
      union all
      select 8, 'media', (select min(s.ready_at) from public.story_media s
                           where s.person_id = p_person and s.deleted_at is null and s.status <> 'uploading'), null
  ) m
  where m.at is not null
$fn$;
revoke execute on function app.story_milestones(uuid) from public, anon, authenticated;

/** One media row as every reader sees it. */
create or replace function app.story_media_item(p public.story_media) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'id', p.id, 'source', p.source, 'role', p.role, 'kind', p.kind, 'mime', p.mime, 'file_name', p.file_name,
    'size_bytes', p.size_bytes, 'parts', p.parts, 'path', p.path, 'caption', p.caption, 'status', p.status,
    'created_at', p.created_at,
    'uploaded_by', (select pr.full_name from public.profiles pr where pr.id = p.uploaded_by))
$fn$;
revoke execute on function app.story_media_item(public.story_media) from public, anon, authenticated;

/** Checks a file before any byte is sent, and opens its row. Shared by the client's door and the team's. */
create or replace function app.story_media_open(p_person uuid, p_source text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_kind  text := p->>'kind';
  v_mime  text := lower(btrim(coalesce(p->>'mime', '')));
  v_size  bigint := nullif(p->>'size_bytes', '')::bigint;
  v_role  text := coalesce(nullif(p->>'role', ''), 'raw');
  v_part  bigint := greatest(app.setting_int('story.part_mb', 45), 1)::bigint * 1024 * 1024;
  v_max   bigint;
  v_parts integer;
  v_id    uuid := gen_random_uuid();
  v_path  text;
begin
  if v_kind not in ('photo', 'video') then
    raise exception 'story_bad_type' using errcode = 'P0001';
  end if;
  if not (v_mime = any (array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                              'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']))
     or (v_kind = 'photo' and v_mime not like 'image/%') or (v_kind = 'video' and v_mime not like 'video/%') then
    raise exception 'story_bad_type' using errcode = 'P0001';
  end if;
  v_max := (case v_kind when 'photo' then app.setting_int('story.max_photo_mb', 20)
                        else app.setting_int('story.max_video_mb', 600) end)::bigint * 1024 * 1024;
  if v_size is null or v_size <= 0 or v_size > v_max then
    raise exception 'story_too_big' using errcode = 'P0001';
  end if;
  v_parts := ceil(v_size::numeric / v_part)::integer;
  if v_parts > 40 then
    raise exception 'story_too_big' using errcode = 'P0001';
  end if;
  if v_role not in ('raw', 'final') or (v_role = 'final' and p_source <> 'staff') then
    raise exception 'story_bad_type' using errcode = 'P0001';
  end if;
  if p_source = 'client' and (select count(*) from public.story_media s
                               where s.person_id = p_person and s.source = 'client'
                                 and s.created_at > now() - interval '1 day')
                             >= app.setting_int('story.max_uploads_per_day', 30) then
    raise exception 'story_too_many' using errcode = 'P0001';
  end if;

  insert into public.success_stories (person_id) values (p_person) on conflict (person_id) do nothing;

  v_path := v_role || '/' || p_person::text || '/' || v_id::text;
  insert into public.story_media (id, person_id, source, role, kind, mime, file_name, size_bytes, parts, path, caption, uploaded_by)
  values (v_id, p_person, p_source, v_role, v_kind, v_mime, left(nullif(btrim(coalesce(p->>'file_name', '')), ''), 200),
          v_size, v_parts, v_path, left(nullif(btrim(coalesce(p->>'caption', '')), ''), 300), auth.uid());

  return jsonb_build_object('id', v_id, 'path', v_path, 'parts', v_parts, 'part_bytes', v_part);
end $fn$;
revoke execute on function app.story_media_open(uuid, text, jsonb) from public, anon, authenticated;

/** The file arrived when storage holds all its parts, adding up to its size — the server counts them. */
create or replace function app.story_media_arrived(p_media uuid, p_bytes bigint, p_parts integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v public.story_media;
begin
  select * into v from public.story_media s where s.id = p_media for update;
  if not found or v.deleted_at is not null then
    raise exception 'story_media_not_found' using errcode = 'P0001';
  end if;
  if v.status <> 'uploading' then
    return app.story_media_item(v);
  end if;
  if p_parts is distinct from v.parts or p_bytes is distinct from v.size_bytes then
    raise exception 'story_upload_incomplete' using errcode = 'P0001';
  end if;
  update public.story_media s set status = 'ready', ready_at = now() where s.id = p_media returning * into v;
  if v.role = 'final' then
    update public.success_stories st set status = case when st.status = 'collecting' then 'editing' else st.status end,
                                         updated_at = now()
     where st.person_id = v.person_id;
  end if;
  return app.story_media_item(v);
end $fn$;
revoke execute on function app.story_media_arrived(uuid, bigint, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · The client's door (service role only: the server has checked his session)
-- ---------------------------------------------------------------------------

create or replace function public.client_story(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v public.success_stories;
begin
  if not app.module_open('zitounti') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  select * into v from public.success_stories s where s.person_id = p_person;
  return jsonb_build_object(
    'ok', true,
    'consent', coalesce(v.consent, 'none'),
    'consent_at', v.consent_at,
    'milestones', app.story_milestones(p_person),
    'media', (select coalesce(jsonb_agg(app.story_media_item(s) order by s.created_at desc), '[]'::jsonb)
                from public.story_media s
               where s.person_id = p_person and s.deleted_at is null and s.role = 'raw'
                 and s.status in ('ready', 'kept')),
    'limits', jsonb_build_object('max_video_mb', app.setting_int('story.max_video_mb', 600),
                                 'max_photo_mb', app.setting_int('story.max_photo_mb', 20)));
end $fn$;

create or replace function public.client_story_start(p_person uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_out jsonb;
begin
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.persons ps where ps.id = p_person and ps.archived_at is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_out := app.story_media_open(p_person, 'client', p - 'role');
  if coalesce((p->>'consent')::boolean, false) then
    perform public.client_story_consent(p_person, true, p->>'consent_text');
  end if;
  return v_out;
end $fn$;

create or replace function public.client_story_arrived(p_person uuid, p_media uuid, p_bytes bigint, p_parts integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not exists (select 1 from public.story_media s where s.id = p_media and s.person_id = p_person and s.source = 'client') then
    raise exception 'story_media_not_found' using errcode = 'P0001';
  end if;
  return app.story_media_arrived(p_media, p_bytes, p_parts);
end $fn$;

/** «نقبل» / «نرجع في الموافقة». Withdrawing takes a ready or published story back to the team, unpublished. */
create or replace function public.client_story_consent(p_person uuid, p_granted boolean, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.success_stories (person_id) values (p_person) on conflict (person_id) do nothing;
  update public.success_stories s
     set consent = case when p_granted then 'granted' else 'withdrawn' end,
         consent_at = now(),
         consent_source = 'client',
         consent_text = case when p_granted then left(nullif(btrim(coalesce(p_text, '')), ''), 600) else s.consent_text end,
         consent_note = null,
         status = case when not p_granted and s.status in ('ready', 'published') then 'withdrawn' else s.status end,
         updated_at = now()
   where s.person_id = p_person;
  perform app.write_audit('success_stories.consent', 'success_stories', p_person::text, null,
                          jsonb_build_object('granted', p_granted, 'source', 'client'), null);
  return jsonb_build_object('consent', case when p_granted then 'granted' else 'withdrawn' end);
end $fn$;

/** His own upload, removed. Returns where it was so the server deletes the parts. */
create or replace function public.client_story_remove(p_person uuid, p_media uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v public.story_media;
begin
  update public.story_media s set deleted_at = now()
   where s.id = p_media and s.person_id = p_person and s.source = 'client' and s.deleted_at is null
  returning * into v;
  if v.id is null then
    raise exception 'story_media_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object('path', v.path, 'parts', v.parts);
end $fn$;

revoke execute on function public.client_story(uuid) from public, anon, authenticated;
revoke execute on function public.client_story_start(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.client_story_arrived(uuid, uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public.client_story_consent(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.client_story_remove(uuid, uuid) from public, anon, authenticated;
grant execute on function public.client_story(uuid) to service_role;
grant execute on function public.client_story_start(uuid, jsonb) to service_role;
grant execute on function public.client_story_arrived(uuid, uuid, bigint, integer) to service_role;
grant execute on function public.client_story_consent(uuid, boolean, text) to service_role;
grant execute on function public.client_story_remove(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6 · The team's door
-- ---------------------------------------------------------------------------

/**
 * «قصص النجاح»: every client with something for a story, newest first; and the ones worth asking — a deposit
 * paid or a contract, and nothing sent yet.
 */
create or replace function public.staff_success_stories() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'stories', (
      select coalesce(jsonb_agg(x.item order by x.last_at desc nulls last), '[]'::jsonb)
      from (
        select greatest(st.updated_at, (select max(m.created_at) from public.story_media m
                                         where m.person_id = p.id and m.deleted_at is null)) as last_at,
               jsonb_build_object(
                 'person', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone_e164', p.phone_e164),
                 'stage', app.person_stage(p.id)->>'label',
                 'status', coalesce(st.status, 'collecting'),
                 'consent', coalesce(st.consent, 'none'),
                 'title', st.title,
                 'photos', (select count(*) from public.story_media m where m.person_id = p.id and m.deleted_at is null
                              and m.kind = 'photo' and m.role = 'raw' and m.status <> 'uploading'),
                 'videos', (select count(*) from public.story_media m where m.person_id = p.id and m.deleted_at is null
                              and m.kind = 'video' and m.role = 'raw' and m.status <> 'uploading'),
                 'has_final', exists (select 1 from public.story_media m where m.person_id = p.id and m.deleted_at is null
                                        and m.role = 'final' and m.status <> 'uploading'),
                 'published_url', st.published_url) as item
        from public.persons p
        left join public.success_stories st on st.person_id = p.id
        where p.archived_at is null and app.can_see_person(p.id)
          and (st.person_id is not null
               or exists (select 1 from public.story_media m where m.person_id = p.id and m.deleted_at is null
                            and m.status <> 'uploading'))
      ) x),
    'to_ask', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'person', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone_e164', p.phone_e164,
                                            'whatsapp_e164', p.whatsapp_e164),
               'stage', app.person_stage(p.id)->>'label') order by p.created_at desc), '[]'::jsonb)
      from (select * from public.persons p
             where p.archived_at is null and app.can_see_person(p.id)
               and (exists (select 1 from public.reservations r where r.person_id = p.id and r.deposit_paid_at is not null)
                    or exists (select 1 from public.contracts c where c.person_id = p.id))
               and not exists (select 1 from public.story_media m where m.person_id = p.id and m.deleted_at is null)
               and not exists (select 1 from public.success_stories st where st.person_id = p.id)
             order by p.created_at desc limit 60) p));
end $fn$;
revoke execute on function public.staff_success_stories() from public, anon;
grant execute on function public.staff_success_stories() to authenticated;

/** One client's story: what the team wrote, the permission, the media, the moments and the whole road. */
create or replace function public.staff_success_story(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_p  public.persons;
  v_st public.success_stories;
begin
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_p from public.persons p where p.id = p_person;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;
  select * into v_st from public.success_stories s where s.person_id = p_person;

  return jsonb_build_object(
    'person', jsonb_build_object('id', v_p.id, 'full_name', v_p.full_name, 'phone_e164', v_p.phone_e164,
                                 'whatsapp_e164', v_p.whatsapp_e164, 'created_at', v_p.created_at,
                                 'governorate', (select g.name_ar from public.governorates g where g.id = v_p.governorate_id)),
    'can_edit', app.can_edit_person(p_person),
    'can_publish', app.is_admin(),
    'stage', app.person_stage(p_person),
    'story', jsonb_build_object(
      'status', coalesce(v_st.status, 'collecting'), 'consent', coalesce(v_st.consent, 'none'),
      'consent_at', v_st.consent_at, 'consent_source', v_st.consent_source, 'consent_text', v_st.consent_text,
      'consent_note', v_st.consent_note, 'title', v_st.title, 'story_text', v_st.story_text,
      'published_url', v_st.published_url, 'published_at', v_st.published_at, 'updated_at', v_st.updated_at),
    'media', (select coalesce(jsonb_agg(app.story_media_item(s) order by s.role desc, s.created_at desc), '[]'::jsonb)
                from public.story_media s where s.person_id = p_person and s.deleted_at is null and s.status <> 'uploading'),
    'milestones', app.story_milestones(p_person),
    'trees', (select coalesce(jsonb_agg(jsonb_build_object('offer', x.name, 'count', x.n) order by x.n desc), '[]'::jsonb)
                from (select pj.name, count(*)::integer as n from public.trees t join public.projects pj on pj.id = t.project_id
                       where t.held_by = p_person and t.state <> 'available' group by pj.name) x),
    'timeline', app.journey_timeline(p_person, 200));
end $fn$;
revoke execute on function public.staff_success_story(uuid) from public, anon;
grant execute on function public.staff_success_story(uuid) to authenticated;

/** The team's words on the story and its stage. Publishing is an administrator's act, and needs the permission. */
create or replace function public.staff_story_save(p_person uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_status text := nullif(p->>'status', '');
  v_url    text := nullif(btrim(coalesce(p->>'published_url', '')), '');
begin
  if not (app.is_staff() and app.can_edit_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status = 'published' and not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('collecting', 'editing', 'ready', 'published', 'withdrawn') then
    raise exception 'invalid_story_status' using errcode = 'P0001';
  end if;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'invalid_story_url' using errcode = 'P0001';
  end if;
  insert into public.success_stories (person_id) values (p_person) on conflict (person_id) do nothing;
  if v_status in ('ready', 'published')
     and (select s.consent from public.success_stories s where s.person_id = p_person) <> 'granted' then
    raise exception 'story_needs_consent' using errcode = 'P0001';
  end if;

  update public.success_stories s
     set title = case when p ? 'title' then left(nullif(btrim(coalesce(p->>'title', '')), ''), 120) else s.title end,
         story_text = case when p ? 'story_text' then left(nullif(btrim(coalesce(p->>'story_text', '')), ''), 4000) else s.story_text end,
         status = coalesce(v_status, s.status),
         published_url = case when p ? 'published_url' then v_url else s.published_url end,
         published_at = case when v_status = 'published' then coalesce(s.published_at, now())
                             when v_status is not null then null else s.published_at end,
         updated_at = now(), updated_by = auth.uid()
   where s.person_id = p_person;
  return public.staff_success_story(p_person)->'story';
end $fn$;
revoke execute on function public.staff_story_save(uuid, jsonb) from public, anon;
grant execute on function public.staff_story_save(uuid, jsonb) to authenticated;

/** A permission the client gave on paper or on WhatsApp, recorded by the team with how it was given. */
create or replace function public.staff_story_consent(p_person uuid, p_granted boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  if not (app.is_staff() and app.can_edit_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_granted and (v_note is null or char_length(v_note) < 5) then
    raise exception 'story_consent_note' using errcode = 'P0001';
  end if;
  insert into public.success_stories (person_id) values (p_person) on conflict (person_id) do nothing;
  update public.success_stories s
     set consent = case when p_granted then 'granted' else 'withdrawn' end,
         consent_at = now(), consent_source = 'staff', consent_note = v_note,
         status = case when not p_granted and s.status in ('ready', 'published') then 'withdrawn' else s.status end,
         updated_at = now(), updated_by = auth.uid()
   where s.person_id = p_person;
  perform app.write_audit('success_stories.consent', 'success_stories', p_person::text, null,
                          jsonb_build_object('granted', p_granted, 'source', 'staff', 'note', v_note), null);
  return public.staff_success_story(p_person)->'story';
end $fn$;
revoke execute on function public.staff_story_consent(uuid, boolean, text) from public, anon;
grant execute on function public.staff_story_consent(uuid, boolean, text) to authenticated;

/** A photo or video the team took (a visit, a planting day) or the finished montage («final»). */
create or replace function public.staff_story_media_start(p_person uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not (app.is_staff() and app.can_edit_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.story_media_open(p_person, 'staff', p);
end $fn$;
revoke execute on function public.staff_story_media_start(uuid, jsonb) from public, anon;
grant execute on function public.staff_story_media_start(uuid, jsonb) to authenticated;

create or replace function public.staff_story_media_arrived(p_media uuid, p_bytes bigint, p_parts integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not (app.is_staff() and app.can_edit_person((select s.person_id from public.story_media s where s.id = p_media))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.story_media_arrived(p_media, p_bytes, p_parts);
end $fn$;
revoke execute on function public.staff_story_media_arrived(uuid, bigint, integer) from public, anon;
grant execute on function public.staff_story_media_arrived(uuid, bigint, integer) to authenticated;

/** «نخلّيها» · «نحّيها جنب» · the caption · removal (the parts are deleted by the server with what this returns). */
create or replace function public.staff_story_media_set(p_media uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v public.story_media;
begin
  select * into v from public.story_media s where s.id = p_media and s.deleted_at is null;
  if not found then
    raise exception 'story_media_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and app.can_edit_person(v.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce((p->>'delete')::boolean, false) then
    update public.story_media s set deleted_at = now(), deleted_by = auth.uid() where s.id = p_media;
    return jsonb_build_object('deleted', true, 'path', v.path, 'parts', v.parts);
  end if;
  if p ? 'status' and (p->>'status') not in ('ready', 'kept', 'set_aside') then
    raise exception 'invalid_story_status' using errcode = 'P0001';
  end if;
  update public.story_media s
     set status = case when p ? 'status' and s.status <> 'uploading' then p->>'status' else s.status end,
         caption = case when p ? 'caption' then left(nullif(btrim(coalesce(p->>'caption', '')), ''), 300) else s.caption end
   where s.id = p_media returning * into v;
  return app.story_media_item(v);
end $fn$;
revoke execute on function public.staff_story_media_set(uuid, jsonb) from public, anon;
grant execute on function public.staff_story_media_set(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7 · The privacy page says it, in its five languages
-- ---------------------------------------------------------------------------

do $$
declare
  v_ar jsonb := jsonb_build_object(
    'title', 'تصاورك وفيديواتك وقصص النجاح',
    'body', 'من فضاء «زيتونتي» تنجم تبعثلنا تصاور وفيديوات على زيتونتك وعلى قصّتك معانا. نحفظوهم في مساحة مغلقة ما يشوفها كان الفريق. ما ننشروهم، وما ننشرو قصّتك، كان إذا قبلت إنت صراحةً: بعلامة تحطّها بيدك في «زيتونتي»، ولا بموافقة كتبتها للفريق. ساعتها ننجمو نعملو منهم فيديو ولا منشور على الموقع وفيسبوك وإنستغرام، من غير ما نزيدو كلام ما قلتوش ومن غير أي وعد بربح. تنجم ترجع في موافقتك وقت ما تحبّ من نفس الصفحة، ونوقفو النشر الجديد. وتنجم تنحّي أي ملف بعثتو.');
  v_tr jsonb := jsonb_build_object(
    'fr', jsonb_build_object('title', 'Vos photos, vos vidéos et les histoires de réussite',
      'body', 'Depuis votre espace « Zitounti », vous pouvez nous envoyer des photos et des vidéos de votre olivier et de votre histoire avec nous. Elles sont gardées dans un espace fermé que seule l''équipe voit. Nous ne les publions, et ne publions votre histoire, que si vous l''acceptez expressément : une case que vous cochez vous-même dans « Zitounti », ou un accord écrit donné à l''équipe. Nous pouvons alors en faire une vidéo ou une publication sur le site, Facebook et Instagram, sans vous prêter des mots que vous n''avez pas dits et sans aucune promesse de gain. Vous pouvez retirer votre accord à tout moment depuis la même page, et nous cessons toute nouvelle publication. Vous pouvez aussi retirer chaque fichier envoyé.'),
    'de', jsonb_build_object('title', 'Ihre Fotos, Ihre Videos und Erfolgsgeschichten',
      'body', 'In Ihrem Bereich „Zitounti“ können Sie uns Fotos und Videos Ihres Olivenbaums und Ihrer Geschichte mit uns senden. Sie werden in einem geschlossenen Bereich aufbewahrt, den nur das Team sieht. Wir veröffentlichen sie – und Ihre Geschichte – nur mit Ihrer ausdrücklichen Zustimmung: ein Häkchen, das Sie selbst in „Zitounti“ setzen, oder eine schriftliche Zustimmung an das Team. Dann können wir daraus ein Video oder einen Beitrag für die Website, Facebook und Instagram machen, ohne Ihnen Worte in den Mund zu legen und ohne jedes Gewinnversprechen. Sie können Ihre Zustimmung jederzeit auf derselben Seite widerrufen; wir veröffentlichen dann nichts Neues mehr. Sie können auch jede gesendete Datei entfernen.'),
    'it', jsonb_build_object('title', 'Le tue foto, i tuoi video e le storie di successo',
      'body', 'Dal tuo spazio «Zitounti» puoi mandarci foto e video del tuo olivo e della tua storia con noi. Sono conservati in uno spazio chiuso che vede solo il team. Li pubblichiamo, e pubblichiamo la tua storia, solo se lo accetti espressamente: una casella che spunti tu stesso in «Zitounti», o un consenso scritto dato al team. Allora possiamo farne un video o un post sul sito, su Facebook e su Instagram, senza attribuirti parole che non hai detto e senza alcuna promessa di guadagno. Puoi ritirare il consenso in qualsiasi momento dalla stessa pagina e smettiamo ogni nuova pubblicazione. Puoi anche rimuovere ogni file inviato.'),
    'en', jsonb_build_object('title', 'Your photos, your videos and success stories',
      'body', 'From your «Zitounti» space you can send us photos and videos of your olive tree and of your story with us. They are kept in a closed space only the team can see. We publish them, and your story, only if you expressly agree: a box you tick yourself in «Zitounti», or a written agreement given to the team. We may then make a video or a post of them for the website, Facebook and Instagram, without putting words in your mouth and without any promise of profit. You can withdraw your agreement at any time from the same page, and we stop any new publication. You can also remove any file you sent.'));
  v_locale text;
begin
  update public.settings
     set value = value || jsonb_build_array(v_ar)
   where key = 'legal.privacy_sections' and jsonb_typeof(value) = 'array'
     and not exists (select 1 from jsonb_array_elements(value) e where e->>'title' = v_ar->>'title');
  for v_locale in select jsonb_object_keys(v_tr) loop
    update public.translations t
       set value = t.value || jsonb_build_array(v_tr->v_locale)
     where t.entity = 'setting' and t.entity_key = 'legal.privacy_sections' and t.field = 'value' and t.locale = v_locale
       and jsonb_typeof(t.value) = 'array'
       and not exists (select 1 from jsonb_array_elements(t.value) e where e->>'title' = v_tr->v_locale->>'title');
  end loop;
  update public.settings set value = to_jsonb(to_char(app.tunis_today(), 'YYYY-MM-DD')), updated_at = now()
   where key = 'legal.privacy_updated_at';
end $$;
