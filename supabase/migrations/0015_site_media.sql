-- 0015 · Site photography and the editorial home sections (design board, panels 01-11)
--
-- MED-01: a photo slot is a row, never a path in the code. AgriZed replaces any picture from the
-- Back Office without a deploy, and the site renders a branded placeholder while a slot is empty.
-- PRN-02 still holds: the numbers, titles and captions around the photos live in `settings`.

-- ---------------------------------------------------------------------------
-- Photo slots
-- ---------------------------------------------------------------------------

create table public.site_media (
  slot            text primary key,
  label_ar        text not null,
  description_ar  text,
  url             text,
  alt_ar          text,
  -- Kept as text so the crop can change without a migration.
  aspect          text not null default '4/3' check (aspect in ('16/9', '3/2', '4/3', '1/1', '3/4', '2/3')),
  group_key       text not null default 'home',
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),
  -- Either empty, or an absolute https address (the public bucket serves https).
  constraint site_media_url_shape check (url is null or url ~ '^https://[^ ]+$'),
  constraint site_media_alt_needed check (url is null or (alt_ar is not null and length(btrim(alt_ar)) > 0))
);

comment on table public.site_media is
  'One row per picture slot on the public site. url empty = the branded placeholder is shown (MED-01).';
comment on column public.site_media.alt_ar is
  'Arabic alternative text. Required as soon as a picture is set, so the site stays accessible.';

create trigger site_media_stamp before update on public.site_media
  for each row execute function app.stamp_updated();
create trigger site_media_audit after insert or update or delete on public.site_media
  for each row execute function app.audit_row_change();

alter table public.site_media enable row level security;

-- Everyone may read the slots: they are the public site's own pictures.
grant select on public.site_media to anon, authenticated;
create policy site_media_read on public.site_media for select to anon, authenticated using (true);

-- Slots are created by migrations; admins only fill them in.
revoke insert, delete on public.site_media from authenticated;
grant update on public.site_media to authenticated;
create policy site_media_admin_update on public.site_media for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Pictures on the plantation-type cards (board panel 05)
-- ---------------------------------------------------------------------------

alter table public.project_types
  add column if not exists image_url text,
  add column if not exists image_alt_ar text;

alter table public.project_types
  add constraint project_types_image_shape check (image_url is null or image_url ~ '^https://[^ ]+$');

-- ---------------------------------------------------------------------------
-- Public bucket for the site's own pictures. Uploads are admin-only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy site_media_objects_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (select app.is_admin()));
create policy site_media_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (select app.is_admin()))
  with check (bucket_id = 'site-media' and (select app.is_admin()));
create policy site_media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (select app.is_admin()));

-- ---------------------------------------------------------------------------
-- The slots the design board asks for
-- ---------------------------------------------------------------------------

insert into public.site_media (slot, label_ar, description_ar, aspect, group_key, sort_order) values
  ('home.hero',     'صورة الواجهة',           'صورة عريضة لغابة زيتون. تظهر في أعلى الصفحة الرئيسية.', '3/2',  'home', 10),
  ('home.journey',  'صورة «كيف تعمل»',         'صورة ميدانية أو صورة فلاح، بجانب خطوات المسار.',        '4/3',  'home', 20),
  ('home.parcel_a', 'مثال قطعة (1)',           'صورة جوية أو أرضية لقطعة زيتون.',                      '4/3',  'home', 30),
  ('home.parcel_b', 'مثال قطعة (2)',           'صورة جوية أو أرضية لقطعة زيتون.',                      '4/3',  'home', 31),
  ('home.parcel_c', 'مثال قطعة (3)',           'صورة جوية أو أرضية لقطعة زيتون.',                      '4/3',  'home', 32),
  ('home.coverage', 'صورة قسم الولايات',       'منظر عام لتونس أو صورة جوية.',                          '4/3',  'home', 40),
  ('home.land',     'صورة قسم أصحاب الأراضي',  'أرض أو ضيعة زيتون.',                                    '3/2',  'home', 50),
  ('home.closing',  'صورة الشريط الختامي',     'صورة واسعة تُختم بها الصفحة، فوقها شعار AgriZed.',       '16/9', 'home', 60)
on conflict (slot) do nothing;

-- ---------------------------------------------------------------------------
-- Copy for the new sections (HOME-02: editable, never hard-coded)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.hero_eyebrow', to_jsonb('منصّة تونسية للتملّك التدريجي'::text),
   'text', 'site', 'سطر فوق العنوان الرئيسي', 'نص قصير يظهر فوق عنوان الواجهة.', true, 101),

  ('site.facts', $json$[
    {"value": "24", "label": "ولاية مفتوحة للتسجيل"},
    {"value": "0 د", "label": "تسجيل الاهتمام مجاني"},
    {"value": "م²", "label": "المساحة وعدد الزيتونات معطيان مستقلّان"}
  ]$json$::jsonb, 'json', 'site', 'أرقام الواجهة',
   'حقائق عن الخدمة فقط. ممنوع أي رقم يوحي بمردود أو ربح (PRN-01).', true, 102),

  ('site.parcels_title', to_jsonb('شنوّة معناها «قطعة» عند AgriZed؟'::text),
   'text', 'site', 'عنوان قسم القطع', null, true, 103),
  ('site.parcels_text', to_jsonb('المساحة، عدد الزيتونات، نوع الغراسة وحالة الإنتاج معطيات مستقلّة: قطعتان بنفس المساحة يمكن أن تختلفا تماماً. الأمثلة التالية توضيحية فقط.'::text),
   'text', 'site', 'نص قسم القطع', null, true, 104),
  ('site.parcel_examples', $json$[
    {"title": "قطعة صغيرة", "area": "500 م²", "trees": "حوالي 12 زيتونة", "system": "غراسة تقليدية", "status": "منتجة"},
    {"title": "قطعة متوسطة", "area": "1000 م²", "trees": "حوالي 25 زيتونة", "system": "غراسة مكثّفة", "status": "شابة"},
    {"title": "قطعة أكبر", "area": "2500 م²", "trees": "حوالي 60 زيتونة", "system": "غراسة مكثّفة", "status": "منتجة"}
  ]$json$::jsonb, 'json', 'site', 'أمثلة القطع',
   'أمثلة توضيحية بدون أسعار. تُعرض تحتها ملاحظة بطاقة القطعة القانونية.', true, 105),

  ('site.coverage_title', to_jsonb('وين تحب تكون قطعتك؟'::text),
   'text', 'site', 'عنوان قسم الولايات', null, true, 106),
  ('site.coverage_text', to_jsonb('التسجيل مفتوح من كل الولايات. الطلبات هي اللي تقول لنا وين نلوّج على العقار الجاي، ومانعرضوش أي عقار قبل ما ندرسوه.'::text),
   'text', 'site', 'نص قسم الولايات', null, true, 107),

  ('site.closing_title', to_jsonb('أصل، جذور، ومستقبل'::text),
   'text', 'site', 'عنوان الشريط الختامي', null, true, 108)
on conflict (key) do nothing;
