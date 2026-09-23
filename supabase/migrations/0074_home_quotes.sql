-- The quote strip above the hero (owner, 2026-09-22: «a banner on top … nice quotes about investment or
-- Tunisian quotes, clean, sliding infinitely»).
--
-- The lines live here, not in the code, for the reason every other sentence on this site does: the owner
-- rewrites them from the Back Office without a deploy (CLAUDE.md). `by` is optional — an empty one prints
-- the line alone, which is what a proverb wants.
--
-- WHAT IS AND IS NOT ATTRIBUTED. «الصبر مفتاح الفرج» and «الصبر شجرة مُرّة الجذور حلوة الثمار» are proverbs
-- in wide circulation and are marked «مثل عربي». The rest are AgriZed's own lines and say so: inventing a
-- proverb and hanging a nation's name on it would be a small lie printed at the top of every page, on a site
-- whose whole argument is «بلا وعود». Replace any of them from Settings › site.quotes.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.quotes',
   '[
      {"ar": "الصبر شجرة مُرّة الجذور، حلوة الثمار.", "by": "مثل عربي"},
      {"ar": "أحسن وقت تغرس فيه زيتونة كان عام لتالي. الوقت اللي بعدو هو اليوم.", "by": "AgriZed"},
      {"ar": "الأرض ما تكذبش: تعطي على قدّ ما تعطيها.", "by": "AgriZed"},
      {"ar": "الصبر مفتاح الفرج.", "by": "مثل عربي"},
      {"ar": "زيتونة اليوم ظلّ وغلّة لولادك.", "by": "AgriZed"}
    ]'::jsonb,
   'json', 'site', 'أقوال الشريط العلوي',
   'الشريط اللي يمشي فوق الصورة الكبيرة في الرئيسية. كل عنصر فيه «ar» (الجملة) و«by» (القائل، اختياري). كي تفضّيه، الشريط ما يتعرضش.',
   true, 95)
on conflict (key) do nothing;
