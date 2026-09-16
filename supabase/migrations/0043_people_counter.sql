-- 0043 · «وين وصلنا؟» counts people, not trees (owner, 2026-09-16: «نبدلوها من عدّاد قداش زيتونة إلى قداش
-- إنسان انتفع … التركيز على الأثر على الناس»).
--
-- The section already knows how many people took part: million_progress() counts one person per phone. What was
-- missing is the wording. The lead line says it in words the owner controls, the bands turn the live count into
-- «أوّل المشاركين / عشرات الأشخاص / مئات الأشخاص», and the encouragement invites the visitor to start small.
-- MIL-01 still holds: the band is chosen by the real count, never by a guess, and nothing here promises a yield
-- or a profit (PRN-01). Emptying a text in the Back Office hides its line, so the owner can retune without a deploy.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('million.people_lead', to_jsonb('{people} بدات تبني أصل زيتوني مع AgriZed'::text), 'text', 'million',
   'جملة الناس في «وين وصلنا؟»',
   'الجملة الكبيرة فوق العدّاد. {people} تتبدّل بالكلمة اللي تجي من «شرائح عدد المشاركين» حسب العدد الحقيقي. فارغة = ما تظهرش. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)',
   true, 40),
  ('million.people_lead_fr', to_jsonb('{people} bâtissent un patrimoine d''oliviers avec AgriZed'::text), 'text', 'million',
   'جملة الناس بالفرنسية', 'نفس الجملة بالفرنسية. فارغة = يظهر السطر بالعربي وحدو.', true, 41),

  ('million.people_bands', '[{"min": 1, "text": "أوّل المشاركين"}, {"min": 10, "text": "عشرات الأشخاص"}, {"min": 100, "text": "مئات الأشخاص"}, {"min": 1000, "text": "آلاف الأشخاص"}]'::jsonb,
   'json', 'million', 'شرائح عدد المشاركين',
   'تترجم عدد المشاركين الحقيقي لكلمة. كل شريحة فيها «min» (العدد اللي منّو تبدا) و«text» (الكلمة). العدّاد يختار أكبر شريحة يوصلها العدد. تنجم تزيد شرائح ولا تبدّل الكلمات والعتبات من هنا.',
   true, 42),
  ('million.people_bands_fr', '[{"min": 1, "text": "Les premiers participants"}, {"min": 10, "text": "Des dizaines de personnes"}, {"min": 100, "text": "Des centaines de personnes"}, {"min": 1000, "text": "Des milliers de personnes"}]'::jsonb,
   'json', 'million', 'شرائح عدد المشاركين بالفرنسية', 'نفس الشرائح بالفرنسية.', true, 43),

  ('million.people_encourage', to_jsonb('إنت زادة تنجم تبدأ بزيتونة وتكبر على قد إمكانياتك.'::text), 'text', 'million',
   'جملة التشجيع تحت جملة الناس',
   'سطر قصير يشجّع الزائر يبدا بقدّ ما ينجم. فارغ = ما يظهرش. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)',
   true, 44),
  ('million.people_encourage_fr', to_jsonb('Vous aussi, commencez par un olivier et grandissez à votre rythme.'::text), 'text', 'million',
   'جملة التشجيع بالفرنسية', 'نفس الجملة بالفرنسية. فارغة = يظهر السطر بالعربي وحدو.', true, 45)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The tree figures step back: they stay available for the Back Office, but the section no longer leads with them.
-- Emptying a tile label hides that tile (million-counter.tsx), which is how the owner drops a figure without code.
-- ---------------------------------------------------------------------------

comment on table public.settings is
  'Site copy and limits (MIL-02, PRN-02). «وين وصلنا؟» reads million.people_* first and the tree tiles after; an empty text hides its line.';
