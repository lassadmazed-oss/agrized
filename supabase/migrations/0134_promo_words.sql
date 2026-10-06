-- 0134 · كلمات التخفيض — the two lines a client reads above the final price.
--
-- Its test is supabase/tests/082_promo_words.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0134_promo_words.sql supabase/tests/082_promo_words.sql
--
-- The owner asked for four figures to be shown — «السعر قبل التخفيض، نسبة التخفيض، قيمة التخفيض، السعر
-- النهائي». Three of them are already rows the figures card knows how to draw, and the fourth, the final
-- price, is the total it has always printed. What was missing is what to CALL the two new ones.
--
-- The tier's own name is not here: it is the owner's, typed once per tier in the Back Office and published by
-- the quote. A tier called «من 25 زيتونة» reads the same in every language because it is a quantity, and a
-- tier he wants to call «عرض الخريف» is his sentence, not a translation of ours.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.promo.before', to_jsonb('السعر قبل التخفيض'::text), 'text', 'ui',
   'التخفيض · سطر السعر قبل',
   'في بطاقة الأرقام: السطر اللي يوري الثمن قبل ما يتطبّق التخفيض. ما يظهرش كان ما فماش تخفيض.', true, 5250),
  ('ui.promo.discount', to_jsonb('التخفيض'::text), 'text', 'ui',
   'التخفيض · سطر قيمة التخفيض',
   'في بطاقة الأرقام: السطر اللي يوري قدّاش تنقّص. القيمة والنسبة يتكتبو وحدهم.', true, 5251),
  ('ui.promo.badge', to_jsonb('تخفيض {percent}%'::text), 'text', 'ui',
   'التخفيض · الشارة',
   'الشارة الصغيرة الخضراء فوق الأرقام. {percent} تتعوّض بنسبة التخفيض. كان التخفيض سعر خاص للزيتونة بدل نسبة، الشارة ما تظهرش.', true, 5252)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.promo.before', 'value', 'fr', to_jsonb('Prix avant remise'::text), true),
  ('setting', 'ui.promo.before', 'value', 'de', to_jsonb('Preis vor Rabatt'::text), true),
  ('setting', 'ui.promo.before', 'value', 'it', to_jsonb('Prezzo prima dello sconto'::text), true),
  ('setting', 'ui.promo.before', 'value', 'en', to_jsonb('Price before the discount'::text), true),

  ('setting', 'ui.promo.discount', 'value', 'fr', to_jsonb('Remise'::text), true),
  ('setting', 'ui.promo.discount', 'value', 'de', to_jsonb('Rabatt'::text), true),
  ('setting', 'ui.promo.discount', 'value', 'it', to_jsonb('Sconto'::text), true),
  ('setting', 'ui.promo.discount', 'value', 'en', to_jsonb('Discount'::text), true),

  ('setting', 'ui.promo.badge', 'value', 'fr', to_jsonb('Remise {percent}%'::text), true),
  ('setting', 'ui.promo.badge', 'value', 'de', to_jsonb('{percent}% Rabatt'::text), true),
  ('setting', 'ui.promo.badge', 'value', 'it', to_jsonb('Sconto {percent}%'::text), true),
  ('setting', 'ui.promo.badge', 'value', 'en', to_jsonb('{percent}% off'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
