-- 0174 · «إشعارات الموقع» — the news a visitor reads when they open the site, not a message sent to their phone.
--
-- Test: supabase/tests/119_site_notices.sql
--
-- The owner, 2026-11-18: «اي برودوي جديد نقولولهم عليه … اي واحد يسجل … ديما نحفزوه باش ياخذ زيتونه … نتبعوه بشويه
-- بشويه» — and then: «ما نحبش SMS، نحب notifications يخرجولو وقت اللي يحل الانترفاس نتاع السيت». So nothing here is
-- sent anywhere. A notice waits on the site; the bell in the header and, once a visit, a small card show it to
-- the person it is meant for when they come back of their own accord. That is also why no new consent is needed:
-- nothing reaches anyone who does not open the site.
--
-- THREE KINDS, ONE TABLE:
--   · offer    — «عرض جديد»: drafted by itself when an offer is published (one per offer), shown to everyone once an
--                administrator publishes it.
--   · journey  — the follow-up after a registration: shown to a known person `after_days` days after they first
--                registered, for notices.journey_window_days, and never to someone who already holds trees.
--   · news / custom — anything the owner writes, to everyone, to registered people or to tree holders.
--
-- WHO IS «A KNOWN PERSON». A client signed in to زيتونتي, or a browser that registered: the intake sets a cookie
-- holding a random token, and public.site_visitor_links keeps only its SHA-256 next to the person. The site never
-- learns more than «this browser sent request N».
--
-- Everything is read and written by the server with the service role (site_*), or by administrators (staff_*).
-- No browser reaches a table.

-- ===========================================================================
-- 1 · The notices, who has read them, and which browser is whom
-- ===========================================================================

create table public.site_notices (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'custom' check (kind in ('offer', 'journey', 'news', 'custom')),
  locale        text not null default 'ar' check (locale ~ '^[a-z]{2}$'),
  title         text not null check (length(btrim(title)) between 2 and 90),
  body          text check (body is null or length(body) <= 400),
  /** Where the button goes: a path on the site, never another site. */
  link_path     text check (link_path is null or link_path ~ '^/[A-Za-z0-9/_?=&%.#-]*$'),
  cta_label     text check (cta_label is null or length(btrim(cta_label)) between 1 and 40),
  image_url     text check (image_url is null or image_url ~ '^https://'),
  audience      text not null default 'everyone' check (audience in ('everyone', 'registered', 'holders')),
  /** journey only: days after the person's first registration. */
  after_days    integer check (after_days is null or after_days between 0 and 365),
  /** Shown once as a card when the visitor arrives, besides waiting in the bell. */
  pop           boolean not null default false,
  project_id    uuid references public.projects (id) on delete cascade,
  status        text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  published_at  timestamptz,
  published_by  uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id),

  constraint site_notices_journey_shape check ((kind = 'journey') = (after_days is not null)),
  constraint site_notices_journey_audience check (kind <> 'journey' or audience = 'registered'),
  constraint site_notices_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- One «عرض جديد» per offer: publishing an offer twice must not announce it twice.
create unique index site_notices_offer_once on public.site_notices (project_id) where kind = 'offer';
create index site_notices_live_idx on public.site_notices (locale, status) where status = 'published';

create table public.site_notice_reads (
  notice_id    uuid not null references public.site_notices (id) on delete cascade,
  person_id    uuid not null references public.persons (id) on delete cascade,
  read_at      timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (notice_id, person_id)
);

create table public.site_visitor_links (
  token_hash   text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  person_id    uuid not null references public.persons (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
create index site_visitor_links_person_idx on public.site_visitor_links (person_id);

alter table public.site_notices       enable row level security;
alter table public.site_notice_reads  enable row level security;
alter table public.site_visitor_links enable row level security;
-- No policies: the tables are read through the functions below, by the server or by administrators.

create trigger site_notices_stamp before update on public.site_notices
  for each row execute function app.stamp_updated();

-- ===========================================================================
-- 2 · Settings and words
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('notices.journey_window_days', to_jsonb(30), 'integer', 'notices', 'إشعارات المتابعة: قدّاش من يوم يبقى كل واحد',
   'إشعار «بعد N يوم من التسجيل» يبان المدّة هذي من بعد، ومن بعد يتخبّى.', false, 10),
  ('notices.offer_title', to_jsonb('جديد على AgriZed: {name}'::text), 'text', 'notices', 'إشعار العرض الجديد: العنوان ({name})', null, false, 11),
  ('notices.offer_body', to_jsonb('الصور، المساحة لكل زيتونة والسوم: كل شيء على صفحة العرض.'::text), 'text', 'notices',
   'إشعار العرض الجديد: النص ({name}، {place})', null, false, 12),
  ('notices.offer_cta', to_jsonb('شوف العرض'::text), 'text', 'notices', 'إشعار العرض الجديد: الزرّ', null, false, 13),
  ('ui.notices.title', to_jsonb('إشعاراتك'::text), 'text', 'ui', 'الموقع: عنوان الإشعارات', null, true, 5540),
  ('ui.notices.open', to_jsonb('الإشعارات'::text), 'text', 'ui', 'الموقع: اسم زرّ الإشعارات', null, true, 5541),
  ('ui.notices.empty', to_jsonb('ما فمّا حتى جديد توّا.'::text), 'text', 'ui', 'الموقع: ما فمّاش إشعارات', null, true, 5542),
  ('ui.notices.close', to_jsonb('سكّر'::text), 'text', 'ui', 'الموقع: سكّر الإشعارات', null, true, 5543),
  ('ui.notices.dismiss', to_jsonb('ما عادش تورّيهولي'::text), 'text', 'ui', 'الموقع: خبّي إشعار', null, true, 5544),
  ('ui.notices.new', to_jsonb('جديد'::text), 'text', 'ui', 'الموقع: علامة إشعار جديد', null, true, 5545)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.notices.title', 'value', 'fr', to_jsonb('Vos notifications'::text), true),
  ('setting', 'ui.notices.title', 'value', 'de', to_jsonb('Ihre Mitteilungen'::text), true),
  ('setting', 'ui.notices.title', 'value', 'it', to_jsonb('Le tue notifiche'::text), true),
  ('setting', 'ui.notices.title', 'value', 'en', to_jsonb('Your notifications'::text), true),
  ('setting', 'ui.notices.open', 'value', 'fr', to_jsonb('Notifications'::text), true),
  ('setting', 'ui.notices.open', 'value', 'de', to_jsonb('Mitteilungen'::text), true),
  ('setting', 'ui.notices.open', 'value', 'it', to_jsonb('Notifiche'::text), true),
  ('setting', 'ui.notices.open', 'value', 'en', to_jsonb('Notifications'::text), true),
  ('setting', 'ui.notices.empty', 'value', 'fr', to_jsonb('Rien de nouveau pour l''instant.'::text), true),
  ('setting', 'ui.notices.empty', 'value', 'de', to_jsonb('Im Moment nichts Neues.'::text), true),
  ('setting', 'ui.notices.empty', 'value', 'it', to_jsonb('Niente di nuovo per ora.'::text), true),
  ('setting', 'ui.notices.empty', 'value', 'en', to_jsonb('Nothing new right now.'::text), true),
  ('setting', 'ui.notices.close', 'value', 'fr', to_jsonb('Fermer'::text), true),
  ('setting', 'ui.notices.close', 'value', 'de', to_jsonb('Schließen'::text), true),
  ('setting', 'ui.notices.close', 'value', 'it', to_jsonb('Chiudi'::text), true),
  ('setting', 'ui.notices.close', 'value', 'en', to_jsonb('Close'::text), true),
  ('setting', 'ui.notices.dismiss', 'value', 'fr', to_jsonb('Ne plus afficher'::text), true),
  ('setting', 'ui.notices.dismiss', 'value', 'de', to_jsonb('Nicht mehr anzeigen'::text), true),
  ('setting', 'ui.notices.dismiss', 'value', 'it', to_jsonb('Non mostrare più'::text), true),
  ('setting', 'ui.notices.dismiss', 'value', 'en', to_jsonb('Don''t show again'::text), true),
  ('setting', 'ui.notices.new', 'value', 'fr', to_jsonb('Nouveau'::text), true),
  ('setting', 'ui.notices.new', 'value', 'de', to_jsonb('Neu'::text), true),
  ('setting', 'ui.notices.new', 'value', 'it', to_jsonb('Nuovo'::text), true),
  ('setting', 'ui.notices.new', 'value', 'en', to_jsonb('New'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

-- ===========================================================================
-- 3 · What a visitor sees (service role only)
-- ===========================================================================

create or replace function public.site_notices_for(p_person uuid, p_locale text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select pr.id, pr.created_at,
           exists (select 1 from public.trees t where t.held_by = pr.id) as holds
      from public.persons pr
     where pr.id = p_person and pr.archived_at is null
  ),
  live as (
    select n.*,
           case when n.after_days is not null then (select me.created_at from me) + make_interval(days => n.after_days)
                else coalesce(n.published_at, n.created_at) end as shown_at,
           r.read_at, r.dismissed_at
      from public.site_notices n
      left join public.site_notice_reads r on r.notice_id = n.id and r.person_id = p_person
     where n.status = 'published'
       and n.locale = p_locale
       and (n.starts_at is null or n.starts_at <= now())
       and (n.ends_at is null or n.ends_at > now())
       and r.dismissed_at is null
       and case n.audience
             when 'everyone'   then true
             when 'registered' then exists (select 1 from me)
             when 'holders'    then coalesce((select me.holds from me), false)
           end
       and (n.after_days is null or exists (
             select 1 from me
              where not me.holds
                and now() >= me.created_at + make_interval(days => n.after_days)
                and now() <  me.created_at + make_interval(days => n.after_days + app.setting_int('notices.journey_window_days', 30))))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'kind', l.kind, 'title', l.title, 'body', l.body, 'link', l.link_path, 'cta', l.cta_label,
           'image', l.image_url, 'pop', l.pop, 'at', l.shown_at, 'read', l.read_at is not null)
         order by l.shown_at desc), '[]'::jsonb)
    from (select * from live order by shown_at desc limit 20) l;
$$;

create or replace function public.site_notice_mark(p_person uuid, p_notice uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('read', 'dismiss') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  insert into public.site_notice_reads (notice_id, person_id, read_at, dismissed_at)
  values (p_notice, p_person, now(), case when p_action = 'dismiss' then now() end)
  on conflict (notice_id, person_id) do update
    set dismissed_at = coalesce(public.site_notice_reads.dismissed_at, excluded.dismissed_at);
end $$;

/** A browser that just registered: its token's hash, against the person behind the request number. */
create or replace function public.site_visitor_link(p_token_hash text, p_request_no text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := (select r.person_id from public.interest_requests r where r.request_no = p_request_no);
begin
  if v_person is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  insert into public.site_visitor_links (token_hash, person_id, last_seen_at) values (p_token_hash, v_person, now())
  on conflict (token_hash) do update set person_id = excluded.person_id, last_seen_at = now();
  return v_person;
end $$;

create or replace function public.site_visitor_person(p_token_hash text) returns uuid
language sql security definer set search_path = '' as $$
  update public.site_visitor_links set last_seen_at = now()
   where token_hash = p_token_hash
  returning person_id;
$$;

revoke execute on function public.site_notices_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.site_notice_mark(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.site_visitor_link(text, text) from public, anon, authenticated;
revoke execute on function public.site_visitor_person(text) from public, anon, authenticated;
grant execute on function public.site_notices_for(uuid, text) to service_role;
grant execute on function public.site_notice_mark(uuid, uuid, text) to service_role;
grant execute on function public.site_visitor_link(text, text) to service_role;
grant execute on function public.site_visitor_person(text) to service_role;

-- ===========================================================================
-- 4 · «عرض جديد», drafted by itself
-- ===========================================================================

create or replace function app.site_notice_for_offer(p_project uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pj    record;
  v_id    uuid;
begin
  select p.id, p.code, p.name, g.name_ar as place,
         (select m.url from public.project_media m where m.project_id = p.id
           order by m.is_cover desc, m.sort_order, m.created_at limit 1) as cover
    into v_pj
    from public.projects p
    left join public.governorates g on g.id = p.governorate_id
   where p.id = p_project and p.status = 'published';
  if not found then
    return null;
  end if;

  insert into public.site_notices (kind, locale, title, body, link_path, cta_label, image_url, audience, pop, project_id)
  values ('offer', 'ar',
          left(replace(app.setting_text('notices.offer_title', 'جديد على AgriZed: {name}'), '{name}', coalesce(v_pj.name, v_pj.code)), 90),
          left(replace(replace(app.setting_text('notices.offer_body', ''), '{place}', coalesce(v_pj.place, '')), '{name}', coalesce(v_pj.name, v_pj.code)), 400),
          '/projects/' || v_pj.code,
          nullif(app.setting_text('notices.offer_cta', ''), ''),
          case when v_pj.cover ~ '^https://' then v_pj.cover end,
          'everyone', true, v_pj.id)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function app.site_notice_for_offer(uuid) from public, anon, authenticated;

create or replace function app.site_notice_offer_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform app.site_notice_for_offer(new.id);
  end if;
  return new;
end $$;

create trigger projects_site_notice after insert or update of status on public.projects
  for each row execute function app.site_notice_offer_published();

-- ===========================================================================
-- 5 · The Back Office (administrators)
-- ===========================================================================

create or replace function public.staff_site_notices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'notices', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', n.id, 'kind', n.kind, 'locale', n.locale, 'title', n.title, 'body', n.body,
                  'link', n.link_path, 'cta', n.cta_label, 'image', n.image_url, 'audience', n.audience,
                  'after_days', n.after_days, 'pop', n.pop, 'status', n.status, 'project_code', p.code,
                  'starts_at', n.starts_at, 'ends_at', n.ends_at, 'published_at', n.published_at, 'created_at', n.created_at,
                  'reads', (select count(*) from public.site_notice_reads r where r.notice_id = n.id),
                  'dismissed', (select count(*) from public.site_notice_reads r where r.notice_id = n.id and r.dismissed_at is not null))
                order by n.status = 'archived', n.kind = 'journey', n.after_days nulls first, n.created_at desc), '[]'::jsonb)
                from public.site_notices n left join public.projects p on p.id = n.project_id),
    'known_browsers', (select count(distinct person_id) from public.site_visitor_links));
end $$;

create or replace function public.staff_save_site_notice(p jsonb) returns public.site_notices
language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'custom');
  v_row  public.site_notices;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p->>'title', ''))) < 2 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.site_notices (kind, locale, title, body, link_path, cta_label, image_url, audience, after_days, pop,
                                     starts_at, ends_at, created_by)
    values (v_kind, coalesce(nullif(p->>'locale', ''), 'ar'), btrim(p->>'title'), nullif(btrim(coalesce(p->>'body', '')), ''),
            nullif(btrim(coalesce(p->>'link', '')), ''), nullif(btrim(coalesce(p->>'cta', '')), ''),
            nullif(btrim(coalesce(p->>'image', '')), ''),
            case when v_kind = 'journey' then 'registered' else coalesce(nullif(p->>'audience', ''), 'everyone') end,
            case when v_kind = 'journey' then coalesce(nullif(p->>'after_days', '')::integer, 1) end,
            coalesce((p->>'pop')::boolean, false),
            nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, (select auth.uid()))
    returning * into v_row;
  else
    update public.site_notices n
       set title = btrim(p->>'title'),
           body = nullif(btrim(coalesce(p->>'body', '')), ''),
           link_path = nullif(btrim(coalesce(p->>'link', '')), ''),
           cta_label = nullif(btrim(coalesce(p->>'cta', '')), ''),
           image_url = nullif(btrim(coalesce(p->>'image', '')), ''),
           audience = case when n.kind = 'journey' then 'registered' else coalesce(nullif(p->>'audience', ''), n.audience) end,
           after_days = case when n.kind = 'journey' then coalesce(nullif(p->>'after_days', '')::integer, n.after_days) end,
           pop = coalesce((p->>'pop')::boolean, n.pop),
           starts_at = nullif(p->>'starts_at', '')::timestamptz,
           ends_at = nullif(p->>'ends_at', '')::timestamptz,
           updated_by = (select auth.uid())
     where n.id = v_id
    returning * into v_row;
    if not found then
      raise exception 'notice_not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_row;
end $$;

create or replace function public.staff_site_notice_status(p_id uuid, p_status text) returns public.site_notices
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.site_notices;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.site_notices n
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(n.published_at, now()) else n.published_at end,
         published_by = case when p_status = 'published' then coalesce(n.published_by, (select auth.uid())) else n.published_by end,
         updated_by = (select auth.uid())
   where n.id = p_id
  returning * into v_row;
  if not found then
    raise exception 'notice_not_found' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

revoke execute on function public.staff_site_notices() from public, anon;
revoke execute on function public.staff_save_site_notice(jsonb) from public, anon;
revoke execute on function public.staff_site_notice_status(uuid, text) from public, anon;
grant execute on function public.staff_site_notices() to authenticated;
grant execute on function public.staff_save_site_notice(jsonb) to authenticated;
grant execute on function public.staff_site_notice_status(uuid, text) to authenticated;

-- ===========================================================================
-- 6 · The first drafts: the follow-up, and the offers already live
-- ===========================================================================
-- Drafts, not published: the owner reads them in the Back Office and publishes what he keeps. No promise of a
-- return or of a harvest in any of them.

insert into public.site_notices (kind, locale, title, body, link_path, cta_label, audience, after_days, pop)
select * from (values
  ('journey', 'ar', 'زيتونتك تستنّى اسمها 🫒',
   'كمّل من وين وقفت: اختار عدد الزيتونات، سمّيها، وشوف الشهادة متاعها.', '/start', 'كمّل', 'registered', 1, true),
  ('journey', 'ar', 'شنوّة الحكاية متاعك؟',
   'زيتونة لولدك، لأمّك، هدية، ولا جذورك في البلاد وإنت برّا. كل حكاية عندها صفحتها.', '/', 'اختار حكايتك', 'registered', 4, true),
  ('journey', 'ar', 'ابدا بزيتونة وحدة',
   'ما يلزمكش برشا باش تبدا: زيتونة وحدة، بالحاضر ولا بالتقسيط، والحاسبة تقلّك قدّاش يجي في النهار.', '/start', 'احسب', 'registered', 10, true),
  ('journey', 'ar', 'تحبّ تشوف الأرض بعينيك؟',
   'تنجم تطلب زيارة للضيعة قبل ما تقرّر. الأرض حقيقية والزيتون حقيقي.', '/projects', 'شوف العروض', 'registered', 20, true)
) as v(kind, locale, title, body, link_path, cta_label, audience, after_days, pop)
where not exists (select 1 from public.site_notices where kind = 'journey');

select app.site_notice_for_offer(p.id) from public.projects p where p.status = 'published';

-- ===========================================================================
-- 7 · The privacy page says it, in its five languages
-- ===========================================================================

do $$
declare
  v_ar jsonb := jsonb_build_object(
    'title', 'الإشعارات في الموقع',
    'body', 'كي تسجّل طلب، نحطّو في المتصفح متاعك رمز عشوائي (cookie) باش كي ترجع للموقع نورّيولك الإشعارات اللي تهمّك: عروض جديدة ومتابعة طلبك. الرمز ما فيه لا اسمك لا نمرتك، وما يتبعث لحتّى جهة أخرى. ما نبعثولك حتى رسالة: الإشعار يستنّى في الموقع حتى تجي إنت. تنجم تخبّي أي إشعار، ولا تفسخ الرمز من إعدادات المتصفح.');
  v_tr jsonb := jsonb_build_object(
    'fr', jsonb_build_object('title', 'Les notifications du site',
      'body', 'Quand vous envoyez une demande, nous plaçons dans votre navigateur un code aléatoire (cookie) pour vous montrer, à votre retour, les notifications qui vous concernent : nouvelles offres et suivi de votre demande. Ce code ne contient ni votre nom ni votre numéro et n''est transmis à personne. Nous ne vous envoyons aucun message : la notification attend sur le site que vous reveniez. Vous pouvez masquer chaque notification ou effacer le code dans votre navigateur.'),
    'de', jsonb_build_object('title', 'Mitteilungen auf der Website',
      'body', 'Wenn Sie eine Anfrage senden, speichern wir in Ihrem Browser einen zufälligen Code (Cookie), um Ihnen bei Ihrer Rückkehr die für Sie bestimmten Mitteilungen zu zeigen: neue Angebote und den Stand Ihrer Anfrage. Der Code enthält weder Ihren Namen noch Ihre Nummer und wird an niemanden weitergegeben. Wir schicken Ihnen keine Nachricht: die Mitteilung wartet auf der Website, bis Sie wiederkommen. Sie können jede Mitteilung ausblenden oder den Code in Ihrem Browser löschen.'),
    'it', jsonb_build_object('title', 'Le notifiche del sito',
      'body', 'Quando invii una richiesta, salviamo nel tuo browser un codice casuale (cookie) per mostrarti, al tuo ritorno, le notifiche che ti riguardano: nuove offerte e il seguito della tua richiesta. Il codice non contiene né il tuo nome né il tuo numero e non viene dato a nessuno. Non ti inviamo alcun messaggio: la notifica aspetta sul sito finché torni. Puoi nascondere ogni notifica o cancellare il codice dal browser.'),
    'en', jsonb_build_object('title', 'Notifications on the site',
      'body', 'When you send a request, we store a random code (a cookie) in your browser so that, when you come back, we can show you the notifications meant for you: new offers and news of your request. The code holds neither your name nor your number and is given to no one. We send you no message: the notification waits on the site until you return. You can hide any notification, or delete the code in your browser.'));
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
end $$;
