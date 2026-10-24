-- 0157 · النشر على فايسبوك وإنستغرام — the accounts, the words, the queue and the rules.
--
-- Its test is supabase/tests/104_social_posts.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0157_social_posts.sql supabase/tests/104_social_posts.sql
--
-- The 2026-10-24 brief for Marketing Automation. This file is everything that does NOT need Meta: the two
-- accounts and where their tokens live, the templates the Back Office writes, the queue with its retries
-- and its logs, and the rules §7 lays down. The dispatcher that talks to the Graph API and the screens come
-- after, and they come after on purpose — §7's rules are the part that is expensive to get wrong, and they
-- belong in the database where no caller can skip them.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHAT THIS CANNOT DO, AND WHY IT IS WRITTEN HERE RATHER THAN DISCOVERED LATER
-- ---------------------------------------------------------------------------------------------------------
-- Publishing to a Facebook Page or an Instagram Professional account needs a Meta app with
-- `pages_manage_posts` and `instagram_content_publish`, and Meta grants those only after business
-- verification and app review. None of that can be obtained from inside this repository — it is the owner's
-- business identity being verified, not a key anybody can mint. So the queue below fills up and waits, and
-- the day the credentials exist the dispatcher drains it. Nothing here guesses at a token.
--
-- ---------------------------------------------------------------------------------------------------------
-- §7's RULES, EACH ONE A CONSTRAINT RATHER THAN A HABIT
-- ---------------------------------------------------------------------------------------------------------
--   · «لا نشر للعروض التجريبية أو الداخلية أو غير المؤكّدة» — app.social_publishable() answers, and the
--     queue's own trigger refuses a row for an offer it says no to. A caller cannot forget it.
--   · «منع تكرار نفس المنشور على نفس الحدث» — dedupe_key is unique. The same offer, the same event and the
--     same network is one row forever, however many times the event fires.
--   · «إذا تبدّل سعر العرض، ما نعدّلوش منشوراً قديماً» — nothing in this schema updates a published post's
--     caption. A price change makes a NEW post, and only if the Back Office says so.
--   · «Queue للمنشورات مع Retry وLogs» — status, attempts, last_error and a log table beside it.

-- ===========================================================================
-- 1 · The two accounts, and where the tokens live
-- ===========================================================================

create table public.social_accounts (
  id             uuid primary key default gen_random_uuid(),
  network        text not null check (network in ('facebook', 'instagram')),

  /** The Page id or the Instagram Business account id, as Meta gives it. */
  external_id    text not null,
  /** What it is called, so the Back Office can say which account is connected. */
  display_name   text,

  /** THE PAGE ACCESS TOKEN. It never leaves the server: the SELECT policy is admin-only, the grant to anon
   *  is revoked, and the Back Office reads this table through a function that does not return this column. */
  access_token   text,
  token_expires_at timestamptz,

  is_enabled     boolean not null default false,
  connected_at   timestamptz,
  connected_by   uuid references public.profiles (id),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id),

  constraint social_accounts_one_per_network unique (network, external_id)
);

comment on table public.social_accounts is
  'The connected Facebook Page and Instagram Professional account. access_token is a secret: the policy is admin-only, anon is revoked, and public.staff_social_accounts reads this table WITHOUT that column so a token cannot reach a browser through the Back Office.';

-- ===========================================================================
-- 2 · The words, per network, per event, per language
-- ===========================================================================

create table public.social_templates (
  id          uuid primary key default gen_random_uuid(),
  /** Null = both networks. Otherwise the one it is written for: Instagram takes no links in a caption. */
  network     text check (network in ('facebook', 'instagram')),
  /** What happened. 'offer_published' is the one §2 describes; the rest are the owner's to add. */
  event       text not null check (event ~ '^[a-z][a-z0-9_]{2,40}$'),
  locale      text not null check (locale ~ '^[a-z]{2}$'),

  /** The caption, with {placeholders} filled from the offer's OWN data. See app.social_compose. */
  body        text not null check (length(btrim(body)) between 10 and 2000),
  hashtags    text check (hashtags is null or length(hashtags) <= 500),
  cta         text check (cta is null or length(cta) <= 200),

  is_active   boolean not null default true,
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),

  constraint social_templates_one_per_slot unique (network, event, locale)
);

comment on table public.social_templates is
  'The marketing copy, per network, per event, per language (§3). Placeholders are filled from the offer''s own columns — §4: «لازم النصوص تعتمد كان المعلومات الفعلية متاع العرض، وما تخترعش أسعار أو مداخيل أو ضمانات».';

-- ===========================================================================
-- 3 · The queue
-- ===========================================================================

create table public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  network       text not null check (network in ('facebook', 'instagram')),
  event         text not null,
  locale        text not null,

  /** §7: one post per offer per event per network, forever. The unique index below is the rule. */
  dedupe_key    text not null,

  status        text not null default 'pending_approval'
                check (status in ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),

  caption       text not null,
  image_url     text,
  /** The offer's page with its UTM parameters (§5). Built by app.social_compose, never typed. */
  link_url      text,

  scheduled_for timestamptz,
  attempts      integer not null default 0 check (attempts >= 0),
  last_error    text,

  /** What Meta answered, once it has. */
  external_post_id text,
  permalink        text,
  published_at     timestamptz,

  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id),
  approved_at   timestamptz,
  approved_by   uuid references public.profiles (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id),

  -- Approval is a person and a moment, together or not at all: half of it recorded is a post nobody can say
  -- who let out.
  constraint social_posts_approval check ((approved_at is null) = (approved_by is null))
);

comment on table public.social_posts is
  'One queued post. §7: dedupe_key makes «the same offer, the same event, the same network» one row forever; attempts and last_error carry the retries; and a published post''s caption is never rewritten — a price change produces a NEW post if the Back Office wants one.';

create unique index social_posts_dedupe_idx on public.social_posts (dedupe_key);
create index social_posts_queue_idx on public.social_posts (status, scheduled_for)
  where status in ('scheduled', 'pending_approval', 'failed');
create index social_posts_project_idx on public.social_posts (project_id, created_at desc);

-- Every attempt, kept. §7 asks for logs, and the reason a post failed at 3am is the one thing nobody can
-- reconstruct afterwards.
create table public.social_post_logs (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.social_posts (id) on delete cascade,
  at          timestamptz not null default now(),
  status      text not null,
  detail      text
);

create index social_post_logs_post_idx on public.social_post_logs (post_id, at desc);

-- ===========================================================================
-- 4 · The doors
-- ===========================================================================
--
-- Tokens, marketing plans and unpublished copy: none of it is a visitor's. Staff read the templates and the
-- queue; only administrators write them or touch an account.

alter table public.social_accounts  enable row level security;
alter table public.social_templates enable row level security;
alter table public.social_posts     enable row level security;
alter table public.social_post_logs enable row level security;

-- The accounts carry a token, so even READING them is administrator-only. The Back Office lists them
-- through public.staff_social_accounts, which does not return the token column at all.
create policy social_accounts_admin on public.social_accounts for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy social_templates_staff_read on public.social_templates for select to authenticated
  using ((select app.is_staff()));
create policy social_templates_admin_write on public.social_templates for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy social_posts_staff_read on public.social_posts for select to authenticated
  using ((select app.is_staff()));
create policy social_posts_admin_write on public.social_posts for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy social_post_logs_staff_read on public.social_post_logs for select to authenticated
  using ((select app.is_staff()));

do $grants$
declare
  v_table text;
begin
  foreach v_table in array array['social_accounts', 'social_templates', 'social_posts', 'social_post_logs'] loop
    execute format('revoke all on public.%I from anon', v_table);
    execute format('create trigger %I before update on public.%I for each row execute function app.stamp_updated()',
      v_table || '_stamp', v_table);
  end loop;
end $grants$;

-- ===========================================================================
-- 5 · §7's first rule, as a function and a trigger
-- ===========================================================================
--
-- «لا نشر للعروض التجريبية أو الداخلية أو غير المؤكّدة». An offer may be queued only when it is PUBLISHED —
-- `internal` is the staging state and `draft` is a thought somebody had. Written once and enforced by a
-- trigger, because the alternative is every caller remembering it and one of them not.

create or replace function app.social_publishable(p_project uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project and p.status = 'published'
  );
$$;

create or replace function app.social_posts_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if not app.social_publishable(new.project_id) then
    raise exception 'offer_not_publishable' using errcode = 'P0001';
  end if;
  return new;
end $fn$;

create trigger social_posts_only_published before insert on public.social_posts
  for each row execute function app.social_posts_guard();

comment on function app.social_publishable(uuid) is
  'Whether an offer may be advertised at all (§7): published only. A draft is a thought and «داخلي فقط» is the staging state — neither is something to put on a company page.';

-- ===========================================================================
-- 6 · Composing one, from the offer's own facts
-- ===========================================================================
--
-- §4: «لازم النصوص تعتمد كان المعلومات الفعلية متاع العرض، وما تخترعش أسعار أو مداخيل أو ضمانات». So the
-- placeholders below are the ONLY things a template can interpolate, every one of them read off the offer
-- or computed by the function that already prices it. There is no placeholder for a return, a yield or a
-- guarantee, and that is deliberate: a template cannot promise what it has no word for.
--
-- THE LINK CARRIES ITS UTM (§5). src/components/site/source-capture.tsx already reads utm_source, medium,
-- campaign and content off the landing URL and every form already sends them with the request, so a post
-- built here lands in the CRM as a source with no further work. The campaign is the offer's own code, so
-- «which post brought this client» is answerable without a spreadsheet.

create or replace function app.social_compose(
  p_project uuid,
  p_network text,
  p_event   text,
  p_locale  text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pj     public.projects;
  v_tpl    public.social_templates;
  v_quote  jsonb;
  v_body   text;
  v_link   text;
  v_origin text := app.setting_text('site.origin', 'https://www.agrized.site');
begin
  select * into v_pj from public.projects p where p.id = p_project;
  if not found or not app.social_publishable(p_project) then
    return null;
  end if;

  -- The offer's own template wins over a network-agnostic one; a missing language falls back to Arabic,
  -- which is the site's source language everywhere else too.
  select * into v_tpl from public.social_templates t
   where t.is_active and t.event = p_event
     and (t.network = p_network or t.network is null)
     and t.locale in (p_locale, 'ar')
   order by (t.network = p_network) desc, (t.locale = p_locale) desc, t.sort_order
   limit 1;
  if not found then
    return null;
  end if;

  v_quote := app.project_quote_payload(p_project, null, greatest(coalesce(v_pj.min_trees_per_order, 1), 1),
                                       null, null, null, false);

  v_link := v_origin || '/' || p_locale || '/projects/' || v_pj.code
         || '?utm_source=' || p_network
         || '&utm_medium=social&utm_campaign=' || v_pj.code;

  v_body := v_tpl.body;
  v_body := replace(v_body, '{offer}', coalesce(v_pj.name, v_pj.code));
  v_body := replace(v_body, '{code}', v_pj.code);
  v_body := replace(v_body, '{trees}', coalesce(v_pj.tree_count::text, ''));
  -- The price only when the offer actually publishes one. A template that asks for {price} on an offer
  -- whose pricing is closed gets an empty string, never a number nobody agreed to.
  v_body := replace(v_body, '{price}',
    case when (v_quote->>'pricing') = 'ok'
         then app.money_ar((v_quote->>'price_per_tree_millimes')::bigint) else '' end);
  -- Instagram does not make a link in a caption clickable, so it is not pasted into one: the post carries
  -- the link beside the caption and the Back Office puts it where that network can use it.
  v_body := replace(v_body, '{link}', case when p_network = 'facebook' then v_link else '' end);

  return jsonb_build_object(
    'project_id', p_project,
    'project_code', v_pj.code,
    'network', p_network,
    'event', p_event,
    'locale', p_locale,
    'caption', btrim(v_body),
    'link_url', v_link,
    -- The offer's cover, read from project_media the way every other screen reads it. A post with no
    -- picture is still a post on Facebook; on Instagram it is nothing at all, which is the dispatcher's
    -- problem to refuse rather than this one's to invent an image for.
    'image_url', (select m.url from public.project_media m
                   where m.project_id = p_project and m.is_cover
                   order by m.sort_order limit 1),
    'dedupe_key', p_project::text || ':' || p_event || ':' || p_network);
end $fn$;

revoke execute on function app.social_compose(uuid, text, text, text) from public, anon, authenticated;

comment on function app.social_compose(uuid, text, text, text) is
  'One post''s caption, link and image, built from the offer''s OWN data (§4). The placeholders are the only things a template can interpolate and there is none for a return, a yield or a guarantee — a template cannot promise what it has no word for. The link carries its UTM, which the site already reads into the CRM.';

-- ===========================================================================
-- 7 · The settings, and the module
-- ===========================================================================

-- The site's own address, in SQL. src/lib/site-origin.ts has held it in TypeScript since the PWA work; a
-- link built in the database needs it too, and two copies of an address is how one of them ends up pointing
-- at a staging domain in a post that went out to three thousand people.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('site.origin', to_jsonb('https://www.agrized.site'::text), 'text', 'site', 'عنوان الموقع',
        'يُستعمل في الروابط اللي تتبنى في القاعدة (منشورات الشبكات مثلاً). بلا سلاش في الآخر.', true, 5)
on conflict (key) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('social.auto_publish', to_jsonb(false), 'boolean', 'social', 'النشر التلقائي',
   'كي يكون مشعول، العرض الجديد المنشور يولّد منشوراً وحدو. كي يكون مطفي، كل شيء يستنّى زرّ.', false, 10),

  ('social.require_approval', to_jsonb(true), 'boolean', 'social', 'المصادقة قبل النشر',
   'المالك (2026-10-24): «نخليوا تغييرات الأسعار والفيديوهات تنتظر مصادقة الإدارة في المرحلة الأولى». كي يكون مشعول، حتى منشور ما يخرج قبل ما يتأكّد من الإدارة.',
   false, 11),

  ('social.events', '["offer_published"]'::jsonb, 'json', 'social', 'الأحداث اللي تولّد منشور',
   'شنوّة يصير في الموقع ويستاهل منشور. اليوم: نشر عرض جديد.', false, 12),

  ('social.networks', '["facebook", "instagram"]'::jsonb, 'json', 'social', 'الشبكات المفعّلة', null, false, 13),

  ('social.max_per_day', to_jsonb(3), 'integer', 'social', 'أقصى عدد منشورات في اليوم',
   'حاجز أمان: صفحة تنشر عشرين مرّة في نهار تخسر متابعيها.', false, 14),

  ('social.max_attempts', to_jsonb(3), 'integer', 'social', 'عدد المحاولات كي يفشل النشر',
   'بعدها المنشور يولّي «فشل» ويستنّى إنسان.', false, 15),

  ('social.locales', '["ar"]'::jsonb, 'json', 'social', 'لغات المنشورات',
   'بأيّ لغة ينشر. زيد لغة هنا كان عندك جمهور يقراها.', false, 16)
on conflict (key) do nothing;

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('social', 'disabled', 3, 'النشر على الشبكات',
   'النشر التلقائي على فايسبوك وإنستغرام. يقعد مطفي حتى يتربط حساب Meta فعلاً — الموديول موجود والطابور يخدم، أما ما فمّاش شكون ينشر قبل ما توصل أذونات Meta.',
   150)
on conflict (key) do nothing;

-- A first template, in the owner's Arabic, with nothing invented in it: the offer's name, its code, its
-- trees and — only when the offer publishes one — the price of a tree.
insert into public.social_templates (network, event, locale, body, cta, hashtags, sort_order) values
  (null, 'offer_published', 'ar',
   E'عرض جديد في AgriZed: {offer}\n\n{trees} زيتونة، كل وحدة باسمك ومربوطة بأرضها.\nسعر الزيتونة ابتداءً من {price}.',
   'شوف التفاصيل وسجّل اهتمامك: {link}',
   '#AgriZed #زيتون #تونس #استثمار_فلاحي', 10)
on conflict (network, event, locale) do nothing;
