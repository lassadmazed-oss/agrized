-- The words on the home screen's four doors (owner, 2026-09-22: «change these to something better»).
--
-- WHAT WAS WRONG WITH THEM.
--
--  · «إستكشف المشاريع» — the site stopped calling them مشاريع. The owner renamed the section to «عروضنا»
--    in the Back Office and every other surface followed; this button was the last place still saying the
--    old word, so the button and the page it opened disagreed.
--  · «ما نعرفش نبدا» — a button labelled with the visitor's confusion rather than with what it does.
--    «عاونّي نختار» asks for the same help and names the outcome.
--  · «نلوّجولك على أرض» / «عندي عرض في بالي» — both stated AgriZed's side of the split. The screen's job
--    there is to sort the reader, so the cards ask the reader the question instead: «ما زلت تحيّر؟» against
--    «تعرف شنوّة تحب؟». A reader knows which of those two they are without reading the note under it.
--
-- WHAT THE NOTES MAY AND MAY NOT CLAIM. «5 أسئلة» is the calculator's real length — it says «الخطوة 1 من 5»
-- on its own first screen. The offer note deliberately carries no step count: booking is one form on one
-- page since 2026-09-22, and a number printed here would be out of date the next time that changes.
--
-- All six are ordinary settings: rewrite any of them in Settings › site.* without a deploy.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.app_hero_cta', to_jsonb('شوف العروض'::text), 'text', 'site', 'زرّ الصورة الكبيرة (الهاتف)',
   'الزرّ الأبيض فوق الصورة في الرئيسية. يوّدي لقائمة العروض.', true, 96),

  ('site.app_guide_cta', to_jsonb('عاونّي نختار'::text), 'text', 'site', 'الزرّ الثاني في الصورة (الهاتف)',
   'الزرّ المفرّغ حذا الأول. يوّدي للحاسبة.', true, 97),

  ('site.app_guide_title', to_jsonb('ما زلت تحيّر؟'::text), 'text', 'site', 'عنوان البطاقة الخضراء',
   'البطاقة اللي توّدي للحاسبة في الرئيسية. تسأل القارئ، ما تحكيش على روحنا.', true, 98),

  ('site.app_guide_note', to_jsonb('جاوب على 5 أسئلة ونقترحولك اللي يناسبك.'::text), 'text', 'site',
   'وصف البطاقة الخضراء', 'سطر تحت العنوان. «5» هو عدد خطوات الحاسبة الحقيقي.', true, 99),

  ('site.app_pick_title', to_jsonb('تعرف شنوّة تحب؟'::text), 'text', 'site', 'عنوان البطاقة البيضاء',
   'البطاقة اللي توّدي للعروض في الرئيسية.', true, 100),

  ('site.app_pick_note', to_jsonb('تصفّح العروض المفتوحة واختار بسهولة.'::text), 'text', 'site',
   'وصف البطاقة البيضاء', 'سطر تحت العنوان. بلا عدد خطوات: الحجز ولّى صفحة وحدة.', true, 101)
on conflict (key) do update set value = excluded.value, updated_at = now();
