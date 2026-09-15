-- 0023 · Report v3 §20 · the full project page: gallery, video, location, description, water, access, documents,
-- AgriZed services, payment and visit copy. Spec: PUB-01, PRJ-02/03, PRN-01/02, MED-01.
--
-- Visitors still never read public.projects: one more whitelisted RPC returns the page, gated exactly like
-- the listing (app.project_visible). Coordinates leave Postgres only when the team ticks «show_location».
-- Pictures live in their own public bucket, written by the roles that already edit projects.
-- Services and documents are option lists (PRN-02): the page shows their names, never a price.

-- ---------------------------------------------------------------------------
-- S1 · What the page shows about a project
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists description_ar      text,
  add column if not exists water_available     boolean,
  add column if not exists water_note          text,
  add column if not exists access_note         text,
  add column if not exists video_url           text,
  add column if not exists show_location       boolean not null default false,
  add column if not exists document_option_ids uuid[] not null default '{}',
  add column if not exists service_option_ids  uuid[] not null default '{}';

alter table public.projects
  add constraint projects_description_length check (length(description_ar) <= 4000),
  add constraint projects_water_note_length check (length(water_note) <= 300),
  add constraint projects_access_note_length check (length(access_note) <= 300),
  -- Same rule as site_media (0015): empty, or an absolute https address.
  add constraint projects_video_shape check (video_url is null or (video_url ~ '^https://[^ ]+$' and length(video_url) <= 500)),
  add constraint projects_documents_bounded check (cardinality(document_option_ids) <= 30),
  add constraint projects_services_bounded check (cardinality(service_option_ids) <= 30);

comment on column public.projects.description_ar is 'Report v3 §20: the text under the project title. Public. No return or profit wording (PRN-01).';
comment on column public.projects.water_available is 'Report v3 §20 «هل توجد مياه». Null = not stated, and the page says nothing.';
comment on column public.projects.water_note is 'Where the water comes from, e.g. a well or a public network. Public.';
comment on column public.projects.access_note is 'Report v3 §20 «إمكانية الوصول»: road, distance. Public.';
comment on column public.projects.video_url is 'Report v3 §20: a YouTube or Vimeo address is embedded, any other https address is linked.';
comment on column public.projects.show_location is 'When true, public_project_page() returns latitude and longitude. Off by default: a precise position is the team''s call.';
comment on column public.projects.document_option_ids is 'Documents on file (option list land_document). The page lists their names; files never go public.';
comment on column public.projects.service_option_ids is 'AgriZed services offered in this project (option list agrized_service, report v3 §36). Names only, no price.';

-- ---------------------------------------------------------------------------
-- S2 · Gallery
-- ---------------------------------------------------------------------------

create table public.project_media (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  url           text not null check (url ~ '^https://[^ ]+$' and length(url) <= 1000),
  -- Path in the project-media bucket when the picture was uploaded here; null for an external address.
  storage_path  text check (length(storage_path) <= 300),
  alt_ar        text not null check (length(btrim(alt_ar)) between 1 and 160),
  caption_ar    text check (length(caption_ar) <= 200),
  is_cover      boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) default auth.uid()
);
create index project_media_project_idx on public.project_media (project_id, sort_order);
-- One cover per project. Without one, the first picture in order is used.
create unique index project_media_one_cover on public.project_media (project_id) where is_cover;
create trigger project_media_audit after insert or update or delete on public.project_media
  for each row execute function app.audit_row_change();

create or replace function app.project_media_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.project_media m where m.project_id = new.project_id)
     >= app.setting_int('projects.gallery_max', 24) then
    raise exception 'gallery_full' using errcode = '23514',
      hint = 'The project already has projects.gallery_max pictures.';
  end if;
  return new;
end $$;
revoke execute on function app.project_media_limit() from public, anon, authenticated;

create trigger project_media_limit before insert on public.project_media
  for each row execute function app.project_media_limit();

alter table public.project_media enable row level security;

-- Default privileges hand anon and authenticated ALL on a new table.
revoke all on public.project_media from anon;
revoke truncate, references, trigger on public.project_media from authenticated;
grant select, insert, update, delete on public.project_media to authenticated;

create policy project_media_select on public.project_media for select to authenticated
  using ((select app.is_staff()));
create policy project_media_insert on public.project_media for insert to authenticated
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_media_update on public.project_media for update to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])))
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_media_delete on public.project_media for delete to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

comment on table public.project_media is
  'Report v3 §20 gallery. Staff read it; Finance and Admin write it; visitors only see it through public_project_page().';

-- Public bucket for project pictures (MED-01). Written by the roles that edit projects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy project_media_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'project-media'
         and (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media'
              and (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_media_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'project-media'
         and (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])))
  with check (bucket_id = 'project-media'
              and (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-media'
         and (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

-- ---------------------------------------------------------------------------
-- S3 · AgriZed services (report v3 §36), as data
-- ---------------------------------------------------------------------------

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('agrized_service', 'خدمات AgriZed', 'code',
   'الخدمات التي تقدّمها AgriZed في مشروع (التقرير §20 و§36). تُختار لكل مشروع وتظهر أسماؤها في صفحته، بلا أسعار.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('agrized_service', 'plowing',            'الحرث',            'Labour',                 10),
  ('agrized_service', 'irrigation',         'السقي',            'Irrigation',             20),
  ('agrized_service', 'monitoring',         'المراقبة',          'Surveillance',           30),
  ('agrized_service', 'pruning',            'التقليم',           'Taille',                 40),
  ('agrized_service', 'guarding',           'الحراسة',           'Gardiennage',            50),
  ('agrized_service', 'harvest',            'الجني',            'Récolte',                60),
  ('agrized_service', 'transport',          'النقل',            'Transport',              70),
  ('agrized_service', 'pressing',           'العصر',            'Trituration',            80),
  ('agrized_service', 'tree_follow_up',     'متابعة الزيتونة',   'Suivi de l''olivier',    90),
  ('agrized_service', 'production_reports', 'تقارير الإنتاج',     'Rapports de production', 100)
on conflict (list_key, code) do nothing;

-- ---------------------------------------------------------------------------
-- S4 · Public surface
-- ---------------------------------------------------------------------------

-- Same columns as 0020; only the cover changes, from null to the project's cover picture.
create or replace function public.public_projects()
returns table (
  id uuid,
  code text,
  name text,
  project_type_id uuid,
  governorate_id smallint,
  delegation_id integer,
  location_description text,
  total_area_m2 numeric,
  olive_variety text,
  tree_count integer,
  tree_age_years numeric,
  plantation_system text,
  production_status text,
  irrigation public.irrigation_type,
  status public.project_status,
  offered boolean,
  parcels_total integer,
  parcels_offered integer,
  min_cash_price_millimes bigint,
  min_area_m2 numeric,
  max_area_m2 numeric,
  parcel_trees integer,
  cover_url text,
  cover_alt_ar text,
  cover_aspect text
)
language sql stable security definer set search_path = '' as $$
  select
    pj.id, pj.code, pj.name, pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pj.location_description, pj.total_area_m2, pj.olive_variety, pj.tree_count, pj.tree_age_years,
    pj.plantation_system, pj.production_status, pj.irrigation, pj.status,
    (pj.status = 'published') as offered,
    a.parcels_total, a.parcels_offered, a.min_cash, a.min_area, a.max_area, a.parcel_trees,
    c.url as cover_url, c.alt_ar as cover_alt_ar, null::text as cover_aspect
  from public.projects pj
  left join lateral (
    select
      (count(*) filter (where pa.status <> 'withdrawn'))::integer as parcels_total,
      (count(*) filter (where app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0))::integer as parcels_offered,
      min(pa.cash_price_millimes) filter (where app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0) as min_cash,
      min(pa.area_m2) filter (where pa.status <> 'withdrawn') as min_area,
      max(pa.area_m2) filter (where pa.status <> 'withdrawn') as max_area,
      (sum(pa.olive_tree_count) filter (where pa.status <> 'withdrawn'))::integer as parcel_trees
    from public.parcels pa
    where pa.project_id = pj.id
  ) a on true
  left join lateral (
    select m.url, m.alt_ar
    from public.project_media m
    where m.project_id = pj.id
    order by m.is_cover desc, m.sort_order, m.created_at
    limit 1
  ) c on true
  where app.project_visible(pj.status)
  order by (pj.status = 'published') desc, pj.created_at desc
$$;

-- The rest of one project's page. Null when the project is not visible to the caller.
create or replace function public.public_project_page(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project_id', pj.id,
    'code', pj.code,
    'description_ar', pj.description_ar,
    'water_available', pj.water_available,
    'water_note', pj.water_note,
    'access_note', pj.access_note,
    'video_url', pj.video_url,
    'latitude', case when pj.show_location then pj.latitude end,
    'longitude', case when pj.show_location then pj.longitude end,
    'document_option_ids', to_jsonb(pj.document_option_ids),
    'service_option_ids', to_jsonb(pj.service_option_ids),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'url', m.url, 'alt_ar', m.alt_ar, 'caption_ar', m.caption_ar,
                                          'is_cover', m.is_cover)
                       order by m.is_cover desc, m.sort_order, m.created_at)
      from (
        select * from public.project_media x
        where x.project_id = pj.id
        order by x.is_cover desc, x.sort_order, x.created_at
        limit app.setting_int('projects.gallery_max', 24)
      ) m
    ), '[]'::jsonb)
  )
  from public.projects pj
  where pj.code = p_code
    and length(p_code) <= 40
    and app.project_visible(pj.status)
$$;

revoke execute on function public.public_projects(), public.public_project_page(text) from public;
grant execute on function public.public_projects(), public.public_project_page(text) to anon, authenticated;

comment on function public.public_projects() is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Cover = the cover picture, else the first in order. Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03).';
comment on function public.public_project_page(text) is
  'Report v3 §20 project page (PUB-01): description, water, access, video, documents and services ids, gallery. Same gate as public_projects(). Coordinates only when show_location. Never pricing formulas, project_costs, legal_notes, land_offer_id, plan_storage_path, storage paths, staff ids (PRJ-03).';

-- ---------------------------------------------------------------------------
-- S5 · Page copy and the gallery limit (HOME-02: editable, never hard-coded)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('projects.about_title', to_jsonb('على المشروع'::text), 'text', 'projects', 'عنوان وصف المشروع',
   'فوق وصف المشروع في صفحته. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 400),
  ('projects.gallery_title', to_jsonb('صور المشروع'::text), 'text', 'projects', 'عنوان معرض الصور',
   'فوق صور المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 410),
  ('projects.video_title', to_jsonb('فيديو المشروع'::text), 'text', 'projects', 'عنوان الفيديو',
   'فوق فيديو المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 420),
  ('projects.location_cta', to_jsonb('شوف الموقع على الخريطة'::text), 'text', 'projects', 'رابط الخريطة',
   'يظهر فقط كي يكون «إظهار الموقع» مفعّلاً في المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 430),
  ('projects.documents_title', to_jsonb('الوثائق المتوفّرة'::text), 'text', 'projects', 'عنوان الوثائق',
   'فوق قائمة الوثائق الموجودة في ملف المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 440),
  ('projects.documents_text', to_jsonb('هذه الوثائق موجودة في ملف المشروع. اطلب الاطلاع عليها كي نتصلو بيك.'::text), 'text', 'projects', 'نص الوثائق',
   'تحت قائمة الوثائق. الملفات نفسها لا تُنشر. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 450),
  ('projects.payment_title', to_jsonb('طريقة الدفع'::text), 'text', 'projects', 'عنوان طريقة الدفع',
   'في صفحة المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 460),
  ('projects.payment_text', to_jsonb('حاضر، أو تسبقة ثم أقساط شهرية. التفاصيل تتحسب لكل قطعة، والمبلغ النهائي والمدة يُضبطان في وعد البيع.'::text), 'text', 'projects', 'نص طريقة الدفع',
   'يشرح طرق الدفع بلا أرقام. الأرقام تبقى في بطاقة كل قطعة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 470),
  ('projects.services_title', to_jsonb('خدمات AgriZed في هذا المشروع'::text), 'text', 'projects', 'عنوان الخدمات',
   'فوق أسماء الخدمات المختارة للمشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 480),
  ('projects.services_text', to_jsonb('خدمات تنجم تطلبها بعد التملّك. شروطها وأسعارها تتوضّح قبل الإمضاء.'::text), 'text', 'projects', 'نص الخدمات',
   'تحت أسماء الخدمات. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 490),
  ('projects.visit_title', to_jsonb('زيارة الأرض'::text), 'text', 'projects', 'عنوان الزيارة',
   'في صفحة المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 500),
  ('projects.visit_text', to_jsonb('تحب تشوف الأرض قبل ما تقرّر؟ سجّل اهتمامك ونتصلو بيك باش نرتّبو موعد الزيارة.'::text), 'text', 'projects', 'نص الزيارة',
   'يشرح كيفاش تتطلب الزيارة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 510),
  ('projects.visit_cta', to_jsonb('نحب نزور الأرض'::text), 'text', 'projects', 'زر الزيارة',
   'يفتح فورمولير التسجيل. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 520),
  ('projects.gallery_max', to_jsonb(24), 'integer', 'projects', 'أقصى عدد صور لكل مشروع',
   'يُفرض في قاعدة البيانات عند إضافة صورة، ويحدّ عدد الصور في صفحة المشروع.', true, 530)
on conflict (key) do nothing;
