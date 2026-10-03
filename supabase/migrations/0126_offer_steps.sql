-- 0126 · استمارة العرض سؤال بسؤال — the words the step-by-step form needs to move between its questions.
--
-- Its test is supabase/tests/076_offer_steps.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0126_offer_steps.sql supabase/tests/076_offer_steps.sql
--
-- THE OWNER'S REQUEST (2026-10-03): «for the forms of the offers i don't like listing all the questions at
-- once, do the question by question like the simulator and directly take to the next after answering».
--
-- The calculator already owns four words for exactly this (ui.start.back, .next, .step_of, .progress_label).
-- They are NOT reused: `ui.start.progress_label` says «التقدم في الحاسبة», and an offer form is not a
-- calculator — the owner spent a long time making sure those two do not read as the same thing (0032, and the
-- badge on /start that says so out loud). Four more rows is the cheaper mistake.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.offer.form_next', to_jsonb('التالي'::text), 'text', 'ui',
   'استمارة العرض · زرّ «التالي»',
   'الزرّ اللي يوّدي للسؤال اللي بعدو في استمارة العرض. يظهر في كل شاشة ما عدا الأخيرة، اللي فيها زرّ الإرسال.', true, 5140),
  ('ui.offer.form_back', to_jsonb('رجوع'::text), 'text', 'ui',
   'استمارة العرض · زرّ الرجوع',
   'السهم في أعلى الاستمارة اللي يرجّع للسؤال اللي قبل. هذا الكلام يقراه قارئ الشاشة، ما يتكتبش على الزرّ.', true, 5141),
  ('ui.offer.form_step_of', to_jsonb('{step}/{total}'::text), 'text', 'ui',
   'استمارة العرض · عدّاد الخطوات',
   'فوق على الطرف: وين وصل الزائر. {step} رقم السؤال الحالي و{total} عدد الأسئلة الكل — والعدد يتبدّل حسب العرض، خاطر عرض يتباع بالحاضر برك ما عندوش أسئلة التقسيط.', true, 5142),
  ('ui.offer.form_progress_label', to_jsonb('التقدّم في استمارة العرض'::text), 'text', 'ui',
   'استمارة العرض · اسم شريط التقدّم',
   'الاسم اللي يقراه قارئ الشاشة لشريط التقدّم الأخضر. ما يظهرش مكتوب.', true, 5143)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.offer.form_next', 'value', 'fr', to_jsonb('Suivant'::text), true),
  ('setting', 'ui.offer.form_next', 'value', 'de', to_jsonb('Weiter'::text), true),
  ('setting', 'ui.offer.form_next', 'value', 'it', to_jsonb('Avanti'::text), true),
  ('setting', 'ui.offer.form_next', 'value', 'en', to_jsonb('Next'::text), true),

  ('setting', 'ui.offer.form_back', 'value', 'fr', to_jsonb('Retour'::text), true),
  ('setting', 'ui.offer.form_back', 'value', 'de', to_jsonb('Zurück'::text), true),
  ('setting', 'ui.offer.form_back', 'value', 'it', to_jsonb('Indietro'::text), true),
  ('setting', 'ui.offer.form_back', 'value', 'en', to_jsonb('Back'::text), true),

  ('setting', 'ui.offer.form_step_of', 'value', 'fr', to_jsonb('{step}/{total}'::text), true),
  ('setting', 'ui.offer.form_step_of', 'value', 'de', to_jsonb('{step}/{total}'::text), true),
  ('setting', 'ui.offer.form_step_of', 'value', 'it', to_jsonb('{step}/{total}'::text), true),
  ('setting', 'ui.offer.form_step_of', 'value', 'en', to_jsonb('{step}/{total}'::text), true),

  ('setting', 'ui.offer.form_progress_label', 'value', 'fr', to_jsonb('Progression du formulaire'::text), true),
  ('setting', 'ui.offer.form_progress_label', 'value', 'de', to_jsonb('Fortschritt im Formular'::text), true),
  ('setting', 'ui.offer.form_progress_label', 'value', 'it', to_jsonb('Avanzamento del modulo'::text), true),
  ('setting', 'ui.offer.form_progress_label', 'value', 'en', to_jsonb('Form progress'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
