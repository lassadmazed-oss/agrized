-- Idea 5 of the story (owner, 2026-11-17): «الحكاية تكمل بعد الشراء». The grove team posts a photo and a sentence
-- for an offer — «نوّرت», «بدا الجني», «جات الشتا» — and every client who holds trees in that offer reads it in
-- زيتونتي («أخبار زيتونتك») and is told on their phone. A happy owner tells the story to others: the page carries
-- «اهدي زيتونة» and «احكي لصحابك».
--
-- Test: supabase/tests/113_tree_news.sql
--
--   public.tree_news          one post per offer: kind (list tree_news_kind), title, text, photo (bucket tree-news)
--   staff_save_tree_news      the grove team (app.can_manage_operations) writes a draft
--   staff_publish_tree_news   publishes it and, once, tells the holders: push to their devices, SMS if chosen
--   my_tree_news              the client's own feed: published posts of the offers they hold trees in
-- What a post may say is the team's; nothing in it is computed, priced or promised.

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('tree_news_kind', 'أنواع أخبار الزيتونات', 'code', 'كل خبر ينشرو الفريق على عرض عندو نوع من هذي القائمة («نوّرت»، «بدا الجني»…).')
on conflict (key) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'bloom', 'نوّرت', 'En fleurs', 10
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'bloom');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('En fleurs'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'bloom'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('In Blüte'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'bloom'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('In fiore'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'bloom'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('In bloom'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'bloom'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'fruit', 'الحبّ بدا يكبر', 'Les olives grossissent', 20
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'fruit');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Les olives grossissent'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'fruit'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Die Oliven wachsen'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'fruit'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Le olive crescono'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'fruit'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('The olives are growing'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'fruit'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'harvest', 'بدا الجني', 'La récolte commence', 30
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'harvest');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('La récolte commence'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'harvest'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Die Ernte beginnt'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'harvest'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Inizia il raccolto'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'harvest'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('The harvest begins'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'harvest'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'care', 'خدمة في الضيعة', 'Travaux au verger', 40
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'care');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Travaux au verger'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'care'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Arbeiten im Hain'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'care'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Lavori nell''oliveto'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'care'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('Work in the grove'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'care'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'rain', 'جات الشتا', 'La pluie est arrivée', 50
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'rain');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('La pluie est arrivée'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'rain'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Der Regen ist da'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'rain'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('È arrivata la pioggia'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'rain'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('The rain has come'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'rain'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_news_kind', 'other', 'خبر من الضيعة', 'Nouvelles du verger', 60
where not exists (select 1 from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'other');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Nouvelles du verger'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'other'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Neues aus dem Hain'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'other'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Notizie dall''oliveto'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'other'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('News from the grove'::text), true
from public.option_items o where o.list_key = 'tree_news_kind' and o.code = 'other'
on conflict (entity, entity_key, field, locale) do nothing;

-- The photographs are of the grove, shown to its owners: a public bucket, written by the server only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tree-news', 'tree-news', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create table if not exists public.tree_news (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  kind_option_id uuid references public.option_items (id),
  kind_label_ar  text check (kind_label_ar is null or char_length(kind_label_ar) <= 120),
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  body           text check (body is null or char_length(body) <= 600),
  photo_path     text check (photo_path is null or char_length(photo_path) <= 300),
  photo_alt      text check (photo_alt is null or char_length(photo_alt) <= 200),
  published_at   timestamptz,
  notified_at    timestamptz,
  push_sent      integer not null default 0,
  sms_sent       integer not null default 0,
  archived_at    timestamptz,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id)
);
create index if not exists tree_news_project_idx on public.tree_news (project_id, published_at desc);

comment on table public.tree_news is
  '«أخبار زيتونتك» (0167): a photo and a sentence per offer, posted by the grove team and read by the clients holding trees in it. Written only through staff_save_tree_news / staff_publish_tree_news / staff_archive_tree_news.';

drop trigger if exists tree_news_stamp on public.tree_news;
create trigger tree_news_stamp before update on public.tree_news for each row execute function app.stamp_updated();
drop trigger if exists tree_news_audit on public.tree_news;
create trigger tree_news_audit after insert or update or delete on public.tree_news
  for each row execute function app.audit_row_change();

alter table public.tree_news enable row level security;
revoke all on public.tree_news from anon;
grant select on public.tree_news to authenticated;
drop policy if exists tree_news_staff_read on public.tree_news;
create policy tree_news_staff_read on public.tree_news for select to authenticated using (app.is_staff());

/** The people who hold trees in an offer — reserved or bought — with a phone to reach them on. */
create or replace function app.tree_news_audience(p_project uuid)
returns table (person_id uuid, phone_e164 text)
language sql stable security definer set search_path = '' as $$
  select distinct p.id, p.phone_e164
  from public.trees t
  join public.persons p on p.id = t.held_by
  where t.project_id = p_project and t.held_by is not null and p.archived_at is null
$$;
revoke execute on function app.tree_news_audience(uuid) from public, anon, authenticated;

create or replace function public.staff_save_tree_news(p jsonb) returns public.tree_news
language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_project uuid := nullif(p->>'project_id', '')::uuid;
  v_kind    public.option_items := app.active_option('tree_news_kind', p->>'kind_option_id');
  v_title   text := btrim(coalesce(p->>'title', ''));
  v_row     public.tree_news;
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p->>'reason');
  if v_project is null or not exists (select 1 from public.projects pj where pj.id = v_project) then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'invalid_news_title' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.tree_news (project_id, kind_option_id, kind_label_ar, title, body, photo_path, photo_alt, created_by)
    values (v_project, v_kind.id, v_kind.label_ar, v_title,
            nullif(left(btrim(coalesce(p->>'body', '')), 600), ''),
            nullif(left(btrim(coalesce(p->>'photo_path', '')), 300), ''),
            nullif(left(btrim(coalesce(p->>'photo_alt', '')), 200), ''),
            auth.uid())
    returning * into v_row;
  else
    update public.tree_news
       set project_id = v_project, kind_option_id = v_kind.id, kind_label_ar = v_kind.label_ar, title = v_title,
           body = nullif(left(btrim(coalesce(p->>'body', '')), 600), ''),
           photo_path = coalesce(nullif(left(btrim(coalesce(p->>'photo_path', '')), 300), ''), photo_path),
           photo_alt = nullif(left(btrim(coalesce(p->>'photo_alt', '')), 200), '')
     where id = v_id and archived_at is null
     returning * into v_row;
    if not found then
      raise exception 'news_not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_row;
end $$;
revoke execute on function public.staff_save_tree_news(jsonb) from public, anon;
grant execute on function public.staff_save_tree_news(jsonb) to authenticated;

/**
 * Publishes a post and tells its readers — once. Push goes to every registered device of every holder; SMS only
 * when the team asks for it (it costs money and reaches phones without the app). Publishing again changes nothing.
 */
create or replace function public.staff_publish_tree_news(p_id uuid, p_push boolean, p_sms boolean, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row     public.tree_news;
  v_project public.projects;
  v_vars    jsonb;
  v_holders integer := 0;
  v_push    integer := 0;
  v_sms     integer := 0;
  r         record;
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  select * into v_row from public.tree_news n where n.id = p_id and n.archived_at is null for update;
  if not found then
    raise exception 'news_not_found' using errcode = 'P0001';
  end if;
  select * into v_project from public.projects pj where pj.id = v_row.project_id;

  if v_row.published_at is null then
    update public.tree_news set published_at = now() where id = p_id;
  end if;

  if v_row.notified_at is null and (coalesce(p_push, false) or coalesce(p_sms, false)) then
    v_vars := jsonb_build_object('title', v_row.title, 'offer', v_project.name);
    for r in select * from app.tree_news_audience(v_row.project_id) loop
      v_holders := v_holders + 1;
      if coalesce(p_push, false) and app.enqueue_push('tree_news.push', r.phone_e164, v_vars, 'tree_news', p_id) > 0 then
        v_push := v_push + 1;
      end if;
      if coalesce(p_sms, false) then
        perform app.enqueue_message('tree_news.sms', r.phone_e164, v_vars, 'tree_news', p_id);
        v_sms := v_sms + 1;
      end if;
    end loop;
    update public.tree_news set notified_at = now(), push_sent = v_push, sms_sent = v_sms where id = p_id;
  else
    select count(*) into v_holders from app.tree_news_audience(v_row.project_id);
  end if;

  return jsonb_build_object('holders', v_holders, 'push', v_push, 'sms', v_sms,
                            'already_notified', v_row.notified_at is not null);
end $$;
revoke execute on function public.staff_publish_tree_news(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.staff_publish_tree_news(uuid, boolean, boolean, text) to authenticated;

create or replace function public.staff_archive_tree_news(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  update public.tree_news set archived_at = now() where id = p_id and archived_at is null;
  if not found then
    raise exception 'news_not_found' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.staff_archive_tree_news(uuid, text) from public, anon;
grant execute on function public.staff_archive_tree_news(uuid, text) to authenticated;

/** The Back Office's view: every post that is not archived, and how many holders each offer would reach. */
create or replace function public.staff_tree_news() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'news', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'project_id', n.project_id, 'project_code', pj.code, 'project_name', pj.name,
               'kind_option_id', n.kind_option_id, 'kind_label_ar', n.kind_label_ar, 'title', n.title, 'body', n.body,
               'photo_path', n.photo_path, 'photo_alt', n.photo_alt, 'published_at', n.published_at,
               'notified_at', n.notified_at, 'push_sent', n.push_sent, 'sms_sent', n.sms_sent, 'created_at', n.created_at)
             order by coalesce(n.published_at, n.created_at) desc), '[]'::jsonb)
             from public.tree_news n join public.projects pj on pj.id = n.project_id
             where n.archived_at is null),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', pj.id, 'code', pj.code, 'name', pj.name,
                 'holders', (select count(*) from app.tree_news_audience(pj.id))) order by pj.name), '[]'::jsonb)
               from public.projects pj)
  );
end $$;
revoke execute on function public.staff_tree_news() from public, anon;
grant execute on function public.staff_tree_news() to authenticated;

/** The signed-in client's feed: published posts of the offers they hold trees in, newest first. */
create or replace function public.my_tree_news() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  select p.id into v_me from public.persons p where p.profile_id = auth.uid() and p.archived_at is null;
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'no_person');
  end if;
  if not app.module_open('zitounti') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  return jsonb_build_object('ok', true, 'items', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id, 'project_code', pj.code, 'project_name', pj.name,
             'kind_code', o.code, 'kind_label', coalesce(o.label_ar, n.kind_label_ar),
             'title', n.title, 'body', n.body, 'photo_path', n.photo_path, 'photo_alt', n.photo_alt,
             'published_at', n.published_at)
           order by n.published_at desc), '[]'::jsonb)
    from (select * from public.tree_news n
          where n.published_at is not null and n.archived_at is null
            and exists (select 1 from public.trees t where t.project_id = n.project_id and t.held_by = v_me)
          order by n.published_at desc limit 60) n
    join public.projects pj on pj.id = n.project_id
    left join public.option_items o on o.id = n.kind_option_id));
end $$;
revoke execute on function public.my_tree_news() from public, anon;
grant execute on function public.my_tree_news() to authenticated;

insert into public.message_templates (key, channel, title_ar, body_ar, description_ar, variables, is_active) values
  ('tree_news.push', 'push', 'أخبار زيتونتك', '{title}', 'إشعار للحرفاء اللي عندهم زيتون في العرض كي يتنشر خبر جديد. العنوان ثابت، والنصّ هو عنوان الخبر.', '{title,offer}', true),
  ('tree_news.sms', 'sms', null, 'AgriZed: خبر جديد على زيتونتك: {title}. شوفو في زيتونتي.', 'SMS للحرفاء اللي عندهم زيتون في العرض كي يتنشر خبر جديد ويختار الفريق «SMS زادا». 70 حرف عربي = SMS واحد.', '{title,offer}', true)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('message_template', 'tree_news.push', 'body', 'fr', to_jsonb('{title}'::text), true),
  ('message_template', 'tree_news.push', 'body', 'de', to_jsonb('{title}'::text), true),
  ('message_template', 'tree_news.push', 'body', 'it', to_jsonb('{title}'::text), true),
  ('message_template', 'tree_news.push', 'body', 'en', to_jsonb('{title}'::text), true),
  ('message_template', 'tree_news.sms', 'body', 'fr', to_jsonb('AgriZed : du nouveau pour votre olivier : {title}. À voir dans votre espace.'::text), true),
  ('message_template', 'tree_news.sms', 'body', 'de', to_jsonb('AgriZed: Neues von Ihrem Olivenbaum: {title}. In Ihrem Bereich ansehen.'::text), true),
  ('message_template', 'tree_news.sms', 'body', 'it', to_jsonb('AgriZed: novità sul tuo olivo: {title}. Guarda nel tuo spazio.'::text), true),
  ('message_template', 'tree_news.sms', 'body', 'en', to_jsonb('AgriZed: news of your olive tree: {title}. See it in your space.'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('zitounti.news_title', to_jsonb('أخبار زيتونتك'::text), 'text', 'zitounti', 'زيتونتي: عنوان الأخبار', null, true, 5500),
  ('ui.news.latest', to_jsonb('آخر خبر'::text), 'text', 'ui', 'زيتونتي: آخر خبر', null, true, 5501),
  ('ui.news.all', to_jsonb('شوف كل الأخبار'::text), 'text', 'ui', 'زيتونتي: كل الأخبار', null, true, 5502),
  ('ui.news.empty', to_jsonb('مازال ما فماش أخبار على زيتونتك. أوّل ما يصير جديد في الضيعة، يوصلك هنا.'::text), 'text', 'ui', 'زيتونتي: ما فماش أخبار', null, true, 5503),
  ('ui.news.gift', to_jsonb('اهدي زيتونة'::text), 'text', 'ui', 'زيتونتي: زرّ الهدية', null, true, 5504),
  ('ui.news.share', to_jsonb('احكي لصحابك'::text), 'text', 'ui', 'زيتونتي: زرّ المشاركة', null, true, 5505),
  ('ui.news.share_text', to_jsonb('زيتونتي في AgriZed: {title}'::text), 'text', 'ui', 'زيتونتي: نصّ المشاركة ({title})', null, true, 5506)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'zitounti.news_title', 'value', 'fr', to_jsonb('Les nouvelles de votre olivier'::text), true),
  ('setting', 'zitounti.news_title', 'value', 'de', to_jsonb('Neues von Ihrem Olivenbaum'::text), true),
  ('setting', 'zitounti.news_title', 'value', 'it', to_jsonb('Notizie del tuo olivo'::text), true),
  ('setting', 'zitounti.news_title', 'value', 'en', to_jsonb('News of your olive tree'::text), true),
  ('setting', 'ui.news.latest', 'value', 'fr', to_jsonb('Dernière nouvelle'::text), true),
  ('setting', 'ui.news.latest', 'value', 'de', to_jsonb('Neueste Nachricht'::text), true),
  ('setting', 'ui.news.latest', 'value', 'it', to_jsonb('Ultima notizia'::text), true),
  ('setting', 'ui.news.latest', 'value', 'en', to_jsonb('Latest news'::text), true),
  ('setting', 'ui.news.all', 'value', 'fr', to_jsonb('Voir toutes les nouvelles'::text), true),
  ('setting', 'ui.news.all', 'value', 'de', to_jsonb('Alle Neuigkeiten ansehen'::text), true),
  ('setting', 'ui.news.all', 'value', 'it', to_jsonb('Vedi tutte le notizie'::text), true),
  ('setting', 'ui.news.all', 'value', 'en', to_jsonb('See all the news'::text), true),
  ('setting', 'ui.news.empty', 'value', 'fr', to_jsonb('Pas encore de nouvelles de votre olivier. Dès qu''il se passe quelque chose au verger, vous le verrez ici.'::text), true),
  ('setting', 'ui.news.empty', 'value', 'de', to_jsonb('Noch keine Neuigkeiten. Sobald im Hain etwas geschieht, sehen Sie es hier.'::text), true),
  ('setting', 'ui.news.empty', 'value', 'it', to_jsonb('Ancora nessuna notizia. Appena succede qualcosa nell''oliveto, la vedrai qui.'::text), true),
  ('setting', 'ui.news.empty', 'value', 'en', to_jsonb('No news yet. As soon as something happens in the grove, you will see it here.'::text), true),
  ('setting', 'ui.news.gift', 'value', 'fr', to_jsonb('Offrir un olivier'::text), true),
  ('setting', 'ui.news.gift', 'value', 'de', to_jsonb('Einen Olivenbaum schenken'::text), true),
  ('setting', 'ui.news.gift', 'value', 'it', to_jsonb('Regala un olivo'::text), true),
  ('setting', 'ui.news.gift', 'value', 'en', to_jsonb('Give an olive tree'::text), true),
  ('setting', 'ui.news.share', 'value', 'fr', to_jsonb('Racontez-le à vos amis'::text), true),
  ('setting', 'ui.news.share', 'value', 'de', to_jsonb('Erzählen Sie es Ihren Freunden'::text), true),
  ('setting', 'ui.news.share', 'value', 'it', to_jsonb('Raccontalo ai tuoi amici'::text), true),
  ('setting', 'ui.news.share', 'value', 'en', to_jsonb('Tell your friends'::text), true),
  ('setting', 'ui.news.share_text', 'value', 'fr', to_jsonb('Mon olivier chez AgriZed : {title}'::text), true),
  ('setting', 'ui.news.share_text', 'value', 'de', to_jsonb('Mein Olivenbaum bei AgriZed: {title}'::text), true),
  ('setting', 'ui.news.share_text', 'value', 'it', to_jsonb('Il mio olivo con AgriZed: {title}'::text), true),
  ('setting', 'ui.news.share_text', 'value', 'en', to_jsonb('My olive tree with AgriZed: {title}'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
