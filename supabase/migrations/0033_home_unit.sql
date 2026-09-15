-- 0033 · Home page on the tree unit (docs/plan-zitouna.md P3-2, owner decision 2026-09-15).
-- One olive tree with its area is the sale unit (docs/tree-area-and-cost.md). The home page explains it with the
-- Back Office spacing classes (0031) and sends the visitor to the calculator; it never shows a price or the
-- internal formula. Copy is data (HOME-02); the two corrections below only apply while the owner has not already
-- edited those texts in the Back Office.

-- ---------------------------------------------------------------------------
-- S1 · Copy of «الزيتونة مع مساحتها»
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.unit_title', to_jsonb('الزيتونة مع مساحتها'::text), 'text', 'site', 'عنوان قسم الوحدة',
   'القسم اللي يشرح أنو AgriZed تبيع الزيتونة مع مساحة أرضها، مكان قسم «القطعة» القديم. فارغ = القسم ما يظهرش. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 130),
  ('site.unit_text', to_jsonb('كل زيتونة تتباع مع مساحة الأرض متاعها. المساحة تتبع طريقة الغراسة: الغراسة الواسعة تعطي كل زيتونة أرض أكبر، والكثيفة أرض أصغر. تختار عدد الزيتونات والمساحة، والسعر يتحسب وحدو.'::text), 'text', 'site', 'نص قسم الوحدة',
   'تحت العنوان. المساحات نفسها تجي من فئات التباعد في صفحة التسعير، موش من هذا النص. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 131),
  ('site.unit_cta', to_jsonb('احسب مشروعك'::text), 'text', 'site', 'زر قسم الوحدة',
   'يفتح الحاسبة (/start). فارغ = بلا زر. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 132),
  ('site.unit_note', to_jsonb('المساحات إرشادية وتختلف من مشروع لآخر. المساحة والسعر النهائيين يتثبّتو في وعد البيع.'::text), 'text', 'site', 'ملاحظة قسم الوحدة',
   'سطر صغير تحت فئات المساحة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 133)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- S2 · Texts that contradict the tree unit, corrected only while unchanged
-- ---------------------------------------------------------------------------

-- The third fact still said the unit and the area are decided per project from the tree count.
update public.settings
set value = jsonb_set(value, '{2}', jsonb_build_object('value', '1 زيتونة', 'label', 'وحدة البيع، ومعاها مساحة الأرض متاعها'))
where key = 'site.facts'
  and jsonb_typeof(value) = 'array'
  and value -> 2 ->> 'value' = 'م²'
  and value -> 2 ->> 'label' = 'الوحدة والمساحة تتحدّدان في كل مشروع حسب عدد الزيتونات';

-- ---------------------------------------------------------------------------
-- S3 · Photo slots of the removed «قطعة» section
-- ---------------------------------------------------------------------------

-- The home page no longer has the three parcel example cards, so their pictures are never shown; keeping the rows
-- would still print their CC BY credits in the footer and list dead slots in «صور الموقع». For the record, they held:
-- home.parcel_a «MAMM Miguel Angel · CC BY 2.0», home.parcel_b «maesejose · CC BY 2.0»,
-- home.parcel_c «Gareth1953 All Right Now · CC BY 2.0».
delete from public.site_media where slot in ('home.parcel_a', 'home.parcel_b', 'home.parcel_c');

-- AgriZed sells trees with their land, not land; the owner also removed the property-search step (2026-09-15).
update public.settings
set value = jsonb_set(value, '{1}', jsonb_build_object(
  'q', 'هل تبيع AgriZed زيتونات الآن؟',
  'a', 'ليس بعد. نجمع الطلبات أولاً، ونعلم أصحاب الطلبات المطابقة عند توفر مشروع. تنجم من توّا تحسب مشروعك وتسجّل اهتمامك.'))
where key = 'site.faq'
  and jsonb_typeof(value) = 'array'
  and value -> 1 ->> 'q' = 'هل تبيع AgriZed أراضي الآن؟'
  and value -> 1 ->> 'a' = 'ليس بعد. نجمع الطلبات أولاً، ثم نبحث عن العقارات المناسبة، ونعلم أصحاب الطلبات المطابقة عند توفر مشروع.';
