-- Pending · The last places that still sold the number (owner, 2026-09-16: «الهدف مش الوصول لرقم»).
--
-- A sweep of every public surface found four: the calculator's own first screen still said «وكل زيتونة
-- تقرّبنا من المليون» in both languages, the closing band's fallback title was «مليون زيتونة», and the first
-- WhatsApp a commercial sends named the million instead of the person's request. /start also carried a
-- hard-coded meta description in the code, so its copy moves into settings like every other page's.
-- The counter keeps its own copy (million.*) and its figures: it is a real count, just not the pitch.
-- Spec: HOME-01, MIL-02, PRN-02, §53. Number claimed at apply time.

-- ---------------------------------------------------------------------------
-- 1 · The calculator's first screen, in both languages
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$اختر العدد اللي يناسبك. كل زيتونة أصل باسمك، يكبر ويثمر مع الوقت.$t$::text)
  where key = 'site.trees_subtitle';
update public.settings set value = to_jsonb($t$Choisissez le nombre qui vous convient. Chaque olivier est un actif à votre nom, qui grandit et produit avec le temps.$t$::text)
  where key = 'site.trees_subtitle_fr';

-- ---------------------------------------------------------------------------
-- 2 · The closing band falls back to the message, not to the number
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$زيتونتك هي مشروعك$t$::text) where key = 'site.vision_title';

-- ---------------------------------------------------------------------------
-- 3 · The first WhatsApp is about the person's request, not about our target
-- ---------------------------------------------------------------------------

update public.message_templates
set body_ar = $t$مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no}. وقتاش يناسبك نحكيو؟$t$
where key = 'lead.whatsapp_first_contact';

-- ---------------------------------------------------------------------------
-- 4 · /start stops carrying its page copy in the code (MIL-02, PRN-02)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.start_meta_title', to_jsonb($t$اختيار عدد الزيتونات$t$::text), 'text', 'site',
   'عنوان صفحة الحاسبة (SEO)', 'يظهر في تبويب المتصفّح وفي نتائج البحث لصفحة /start.', true, 368),
  ('site.start_meta_title_fr', to_jsonb($t$Choisir par nombre d oliviers$t$::text), 'text', 'site',
   'عنوان صفحة الحاسبة (فرنسي)', null, true, 369),
  ('site.start_meta_description',
   to_jsonb($t$اختر قدّاش زيتونة تحب تبدا بيهم وكيفاش تحب تخلّص. كل زيتونة أصل باسمك يكبر مع الوقت. التسجيل مجاني ولا يمثل التزاماً.$t$::text),
   'text', 'site', 'وصف صفحة الحاسبة (SEO)', 'الوصف اللي يظهر في نتائج البحث لصفحة /start.', true, 370),
  ('site.start_meta_description_fr',
   to_jsonb($t$Choisissez combien d oliviers et comment vous souhaitez payer. Chaque olivier est un actif à votre nom qui grandit avec le temps. Inscription gratuite et sans engagement.$t$::text),
   'text', 'site', 'وصف صفحة الحاسبة (فرنسي)', null, true, 371);
