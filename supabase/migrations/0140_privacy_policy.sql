-- 0140 · سياسة الخصوصية: the page Google Play will not accept an app without, and its words as settings.
--
-- Test: supabase/tests/087_privacy_policy.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0140_privacy_policy.sql supabase/tests/087_privacy_policy.sql
--
-- WHY IT EXISTS NOW. Play requires a privacy policy URL before any release track, including closed testing,
-- for any app that collects personal data — and this one collects a name, a phone number, a governorate and
-- a goal. The site had no public legal page at all: site-footer.tsx reads `site.legal_links` and says in its
-- own comment that it prints nothing because «no such routes exist». They exist now, so the link does too.
--
-- WHY EVERY SENTENCE IS A ROW AND NOT A FILE. The same rule as the rest of this project: the owner's words
-- are his. A policy hard-coded in a .tsx is one he cannot correct without a deploy, and this is the document
-- most likely to need correcting — the day a lawyer reads it, the day a new field is collected, the day the
-- company's legal name is registered.
--
-- WHAT IT DESCRIBES IS WHAT THE SCHEMA ACTUALLY DOES, checked field by field against the tables rather than
-- copied from a template: persons (name, phone, whatsapp, email, governorate, delegation), interest_requests
-- (the goal, the trees, the note), contracts (CIN and address, at signing), push_tokens (0138, the device),
-- audit_logs (a hashed IP and the browser's user agent). Nothing is claimed that is not collected, and
-- nothing collected is left out.
--
-- ███ THIS IS NOT LEGAL ADVICE. It is an accurate description of what the system does, in the owner's voice,
-- ███ and it is what Play asks for. Tunisia's loi n°2004-63 and the INPDP's registration duties are the
-- ███ owner's to satisfy with a lawyer; nothing here claims that has been done.

-- ---------------------------------------------------------------------------
-- Who the data controller is
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('legal.entity_name', to_jsonb(''::text), 'text', 'legal', 'الاسم القانوني للشركة',
   'الاسم كيما هو في السجل التجاري. يظهر في سياسة الخصوصية كمسؤول عن معالجة المعطيات. كي يكون فارغ، تظهر «AgriZed» وحدها — وهذا مقبول مؤقتاً، أما التسمية القانونية أوضح للحريف وللمنصّات.',
   true, 10),
  ('legal.privacy_email', to_jsonb(''::text), 'text', 'legal', 'بريد طلبات المعطيات',
   'العنوان اللي يتصل بيه الحريف باش يشوف معطياته ولا يصلّحها ولا يمسحها. كي يكون فارغ، نستعملو site.contact_email.',
   true, 20),
  ('legal.privacy_updated_at', to_jsonb('2026-10-12'::text), 'text', 'legal', 'تاريخ آخر تحديث للسياسة',
   'يظهر في أعلى الصفحة. بدّلو كلّ مرّة تتبدّل السياسة.',
   true, 30)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The page itself
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('legal.privacy_title', to_jsonb('سياسة الخصوصية'::text), 'text', 'legal', 'عنوان صفحة الخصوصية', null, true, 40),
  ('legal.privacy_intro', to_jsonb(
     'هذه الصفحة تشرح شنوّة المعطيات اللي نجمعوها منك، علاش نجمعوها، مع من نشاركوها، وكيفاش تنجم تتحكّم فيها. تنطبق على موقع AgriZed وعلى تطبيق الهاتف.'::text),
   'text', 'legal', 'مقدّمة صفحة الخصوصية', null, true, 50),
  ('legal.privacy_sections', jsonb_build_array(
     jsonb_build_object(
       'title', 'شنوّة نجمعو',
       'body', 'كي تعمّر مطلب اهتمام: الاسم والكنية، نمرة التلفون، البريد الإلكتروني (اختياري)، الولاية والمعتمدية، شنوّة تحبّ تعمل وعدد الزيتونات اللي تهمّك، وأي ملاحظة تكتبها.' ||
               E'\n' || 'كي تحجز أو تمضي عقد: رقم بطاقة التعريف والعنوان، وهي لازمة للعقد نفسه.' ||
               E'\n' || 'كي تفتح حساب «زيتونتي»: نمرة التلفون وكلمة سرّ مشفّرة. ما نشوفوش كلمة السرّ متاعك.' ||
               E'\n' || 'كي تقبل الإشعارات في التطبيق: رمز الجهاز اللي يسمحلنا نبعثولك إشعار. ما فيه لا اسم لا نمرة.' ||
               E'\n' || 'في كل الحالات: تاريخ وساعة العملية، ونوع المتصفّح، وبصمة مشفّرة لعنوان IP — للأمان وللتثبّت من المطالب، موش للإشهار.'),
     jsonb_build_object(
       'title', 'علاش نجمعوها',
       'body', 'باش نتصلو بيك على المطلب اللي بعثتو، نحسبولك تقدير، نحضّرو ونتابعو العقد والأقساط، نبعثولك رسائل وإشعارات على ملفّك، ونحميو الموقع من المطالب الوهمية. ما نستعملوش معطياتك باش نبيعولك حاجة أخرى، وما نبيعوهمش لحتّى حدّ.'),
     jsonb_build_object(
       'title', 'مع من نشاركوها',
       'body', 'ما نبيعو معطياتك لحتّى جهة. نشاركوها كان مع المزوّدين اللي يخدمو معانا باش الخدمة تمشي: مزوّد الاستضافة وقاعدة البيانات، مزوّد الرسائل القصيرة باش توصلك الرسالة، وخدمة الإشعارات متاع Expo كي تقبل الإشعارات. كل واحد منهم ياخذ كان القدّ اللي يلزمو. زيد على هذا، كان إذا طلبتها جهة قضائية بصفة قانونية.'),
     jsonb_build_object(
       'title', 'قدّاش نحتفظو بيها',
       'body', 'المطالب والعقود نحتفظو بيهم مدّة ما تتطلّب الالتزامات القانونية والمحاسبية. كي تطلب المسح ونكونو ما عندناش موجب قانوني نحتفظو، نمسحو معطياتك. رمز الإشعارات يتمسح كي تشيل التطبيق ولا توقّف الإشعارات.'),
     jsonb_build_object(
       'title', 'حقوقك',
       'body', 'تنجم تطلب تشوف المعطيات اللي عندنا عليك، تصلّحها، ولا تمسحها، وتنجم ترجع في موافقتك على الاتصال بيك في أي وقت. أكتبلنا على البريد اللي في آخر الصفحة ونجاوبوك.'),
     jsonb_build_object(
       'title', 'الأطفال',
       'body', 'الخدمة موجّهة للكبار. ما نجمعوش معطيات عن الأطفال بمعرفتنا، وكي يوصلنا إلي عملنا هكا، نمسحوها.')),
   'json', 'legal', 'فصول صفحة الخصوصية',
   'كل فصل فيه «title» و«body». تنجم تزيد، تنقّص، ولا تبدّل النص. السطور الجديدة تتحوّل لفقرات.',
   true, 60),
  ('legal.privacy_contact', to_jsonb(
     'على أي سؤال في الخصوصية، أو باش تطلب معطياتك ولا مسحها، أكتبلنا على:'::text),
   'text', 'legal', 'سطر التواصل في صفحة الخصوصية', null, true, 70)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The footer link, which has been waiting for a route to point at
-- ---------------------------------------------------------------------------

/*
 * site-footer.tsx reads this and filters out anything without both a label and an href, so it has printed
 * nothing since it was written — its comment says so, and says why: «a footer link that resolves to nothing
 * is worse than a footer without it». The route exists now.
 *
 * The href has no language prefix: the footer's own links are resolved through localeHref, and /privacy is
 * a page under [lang] like every other.
 */
/*
 * The row does not exist. `npm run i18n:check` has been listing site.legal_links among its missing keys, and
 * the footer has been reading a key that was never seeded — settingJson returns the fallback [] and the bar
 * prints the copyright alone. So this inserts rather than updates, and only fills a value that is absent or
 * empty, so an owner who has already written his own links keeps them.
 */
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('site.legal_links',
        jsonb_build_array(jsonb_build_object('label', 'سياسة الخصوصية', 'href', '/privacy')),
        'json', 'site', 'روابط قانونية في أسفل الموقع',
        'قائمة {label, href}. تظهر في شريط أسفل كل صفحة. الرابط بلا بادئة لغة — الموقع يزيدها وحدو.',
        true, 900)
on conflict (key) do update
   set value = excluded.value,
       is_public = true
 where coalesce(
         jsonb_array_length(case when jsonb_typeof(public.settings.value) = 'array' then public.settings.value else '[]'::jsonb end),
         0) = 0;
