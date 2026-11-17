-- «التقسيط بلغة النهار» (owner, 2026-11-17, idea 6 of the story: «174 د في الشهر تولّي أقل من 6 د في النهار، قدّ
-- قهوتين»). Under the monthly instalment, on /start, /register and an offer's form: the same amount said per day,
-- and — while it stays small — what that is in coffees («أرخص من قهوة» under the price of one).
--
-- Test: supabase/tests/114_daily_instalment.sql
--
-- THE ARITHMETIC IS A RESTATEMENT, NOT A PRICE. The monthly figure is the quote's own (project_quote_payload); the
-- page divides it by start.per_day_days and rounds UP to start.per_day_step, so «أقل من» is always true and an
-- exact amount is said as exact (start.per_day_exact). The comparison is shown only up to start.per_day_compare_max
-- coffees at start.per_day_compare_price each; beyond that it would stop being an everyday picture. Every number
-- and every word is the owner's to change; an empty text hides its line.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.per_day_days', to_jsonb(30), 'integer', 'start', 'الحاسبة: القسط بالنهار — أيام الشهر',
   'القسط الشهري يتقسم على العدد هذا باش يتحكى بالنهار. 0 يخبّي السطر.', true, 2090),
  ('start.per_day_step', to_jsonb(1000), 'money', 'start', 'الحاسبة: القسط بالنهار — التدوير للفوق',
   'المبلغ في النهار يتدوّر للفوق للخطوة هذي (بالمليم، 1000 = دينار)، باش «أقل من» تبقى صحيحة.', true, 2091),
  ('start.per_day_exact', to_jsonb('{amount} في النهار'::text), 'text', 'start', 'الحاسبة: القسط بالنهار كي يطيح صحيح ({amount})', null, true, 2092),
  ('start.per_day_exact_fr', to_jsonb('{amount} par jour'::text), 'text', 'start', 'الحاسبة: القسط بالنهار كي يطيح صحيح ({amount}) (الفرنسي تحت العربي)', null, true, 2093),
  ('start.per_day_less', to_jsonb('أقل من {amount} في النهار'::text), 'text', 'start', 'الحاسبة: القسط بالنهار ({amount} مدوّر للفوق)', null, true, 2094),
  ('start.per_day_less_fr', to_jsonb('Moins de {amount} par jour'::text), 'text', 'start', 'الحاسبة: القسط بالنهار ({amount} مدوّر للفوق) (الفرنسي تحت العربي)', null, true, 2095),
  ('start.per_day_compare', to_jsonb('{count, plural, =0 {أرخص من قهوة} one {قدّ قهوة} two {قدّ قهوتين} few {قدّ # قهاوي} other {قدّ # قهوة}}'::text), 'text', 'start',
   'الحاسبة: القسط بالنهار — المقارنة ({count} = كم قهوة، 0 = أرخص من قهوة)', 'فارغ يخبّي المقارنة.', true, 2096),
  ('start.per_day_compare_fr', to_jsonb('{count, plural, =0 {moins qu''un café} one {soit un café} other {soit # cafés}}'::text), 'text', 'start',
   'الحاسبة: القسط بالنهار — المقارنة ({count} = كم قهوة) (الفرنسي تحت العربي)', null, true, 2097),
  ('start.per_day_compare_price', to_jsonb(3000), 'money', 'start', 'الحاسبة: القسط بالنهار — سوم القهوة',
   'بالمليم. المبلغ في النهار يتقسم عليه باش يطلع كم قهوة.', true, 2098),
  ('start.per_day_compare_max', to_jsonb(3), 'integer', 'start', 'الحاسبة: القسط بالنهار — أكثر عدد قهاوي',
   'كي يفوت المبلغ العدد هذا من القهاوي، المقارنة ما تبانش. 0 يخبّيها ديما.', true, 2099)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'start.per_day_exact', 'value', 'fr', to_jsonb('{amount} par jour'::text), true),
  ('setting', 'start.per_day_exact', 'value', 'de', to_jsonb('{amount} pro Tag'::text), true),
  ('setting', 'start.per_day_exact', 'value', 'it', to_jsonb('{amount} al giorno'::text), true),
  ('setting', 'start.per_day_exact', 'value', 'en', to_jsonb('{amount} a day'::text), true),
  ('setting', 'start.per_day_less', 'value', 'fr', to_jsonb('Moins de {amount} par jour'::text), true),
  ('setting', 'start.per_day_less', 'value', 'de', to_jsonb('Weniger als {amount} pro Tag'::text), true),
  ('setting', 'start.per_day_less', 'value', 'it', to_jsonb('Meno di {amount} al giorno'::text), true),
  ('setting', 'start.per_day_less', 'value', 'en', to_jsonb('Less than {amount} a day'::text), true),
  ('setting', 'start.per_day_compare', 'value', 'fr', to_jsonb('{count, plural, =0 {moins qu''un café en Tunisie} one {le prix d''un café en Tunisie} other {le prix de # cafés en Tunisie}}'::text), true),
  ('setting', 'start.per_day_compare', 'value', 'de', to_jsonb('{count, plural, =0 {weniger als ein Kaffee in Tunesien} one {so viel wie ein Kaffee in Tunesien} other {so viel wie # Kaffees in Tunesien}}'::text), true),
  ('setting', 'start.per_day_compare', 'value', 'it', to_jsonb('{count, plural, =0 {meno di un caffè in Tunisia} one {quanto un caffè in Tunisia} other {quanto # caffè in Tunisia}}'::text), true),
  ('setting', 'start.per_day_compare', 'value', 'en', to_jsonb('{count, plural, =0 {less than a coffee in Tunisia} one {about one coffee in Tunisia} other {about # coffees in Tunisia}}'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
