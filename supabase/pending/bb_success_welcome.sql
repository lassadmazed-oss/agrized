-- 0036 · Welcome and encouragement on the confirmation screen (owner, 2026-09-16: «اعمل ترحيب و تحفيز»).
--
-- After «تم تسجيل مطلبك» the visitor reads a welcome, what happens next, and one encouraging line that points at the
-- public counter. HOME-02: every line is a setting. PRN-01: nothing here promises a return, a profit or a purchase;
-- registering stays free and binding on nobody.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('register.success_welcome_title', to_jsonb('مرحباً بيك في مشروع المليون زيتونة'::text), 'text', 'lead',
   'ترحيب صفحة التأكيد', 'يظهر تحت «تم تسجيل مطلبك». فارغ = ما يظهرش. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 210),
  ('register.success_welcome_text', to_jsonb('مطلبك وصلنا وتسجّل باسمك. من هنا للأمام نرافقوك: نراجعو اختياراتك، نتصلو بيك، ونعرضو عليك المشروع اللي يناسبك كي يتوفّر.'::text), 'text', 'lead',
   'نص الترحيب في صفحة التأكيد', 'يشرح للحريف شنوّة يصير بعد التسجيل. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 211),
  ('register.success_motivation', to_jsonb('كل مطلب يقرّب المشروع خطوة من المليون زيتونة. زيتوناتك تولّي جزء من العدّاد كي يتم التعاقد.'::text), 'text', 'lead',
   'جملة التحفيز في صفحة التأكيد', 'جملة قصيرة تحفّز بلا وعود. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 212),
  ('register.success_progress_label', to_jsonb('شوف وين وصل المشروع'::text), 'text', 'lead',
   'زر العدّاد في صفحة التأكيد', 'يفتح قسم «وين وصلنا؟» في الصفحة الرئيسية. فارغ = بلا زر. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 213)
on conflict (key) do nothing;
