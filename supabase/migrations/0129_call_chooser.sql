-- 0129 · اتصال ولا واتساب — THE WORDS OF THE CALL CHOOSER.
--
-- Owner, 2026-10-05: «for the call buttons make a popup to choose between either direct call or call WhatsApp,
-- something nice and clean». Every call button on the site now opens one chooser (src/components/site/
-- call-chooser.tsx): a plain call or WhatsApp. Its words are shared, so they live under ui.common and reach
-- every page with the language; drafts in the four other languages, for the owner to review.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.common.call_title', to_jsonb('كيفاش تحب تكلّمنا؟'::text), 'text', 'ui', 'عنوان نافذة الاتصال',
   'يظهر كي يضغط الزائر على أي زر «اتصل»: يختار بين مكالمة عادية وواتساب.', true, 50),
  ('ui.common.call_direct', to_jsonb('مكالمة عادية'::text), 'text', 'ui', 'خيار المكالمة العادية',
   'السطر الأول في نافذة الاتصال؛ تحتو يظهر الرقم.', true, 51),
  ('ui.common.call_whatsapp', to_jsonb('واتساب'::text), 'text', 'ui', 'خيار واتساب',
   'السطر الثاني في نافذة الاتصال.', true, 52),
  ('ui.common.call_whatsapp_note', to_jsonb('مكالمة ولا ميساج على واتساب'::text), 'text', 'ui', 'شرح خيار واتساب',
   'تحت «واتساب» في نافذة الاتصال.', true, 53),
  ('ui.common.call_us', to_jsonb('اتصل بينا'::text), 'text', 'ui', 'الاسم المسموع لزر الاتصال',
   'يقراه قارئ الشاشة على أزرار الاتصال اللي فيها كان أيقونة.', true, 54)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.common.call_title', 'value', 'fr', '"Comment souhaitez-vous nous joindre ?"', true),
  ('setting', 'ui.common.call_title', 'value', 'de', '"Wie möchten Sie uns erreichen?"', true),
  ('setting', 'ui.common.call_title', 'value', 'it', '"Come preferisce contattarci?"', true),
  ('setting', 'ui.common.call_title', 'value', 'en', '"How would you like to reach us?"', true),
  ('setting', 'ui.common.call_direct', 'value', 'fr', '"Appel téléphonique"', true),
  ('setting', 'ui.common.call_direct', 'value', 'de', '"Telefonanruf"', true),
  ('setting', 'ui.common.call_direct', 'value', 'it', '"Chiamata telefonica"', true),
  ('setting', 'ui.common.call_direct', 'value', 'en', '"Phone call"', true),
  ('setting', 'ui.common.call_whatsapp', 'value', 'fr', '"WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp', 'value', 'de', '"WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp', 'value', 'it', '"WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp', 'value', 'en', '"WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp_note', 'value', 'fr', '"Appel ou message sur WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp_note', 'value', 'de', '"Anruf oder Nachricht über WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp_note', 'value', 'it', '"Chiamata o messaggio su WhatsApp"', true),
  ('setting', 'ui.common.call_whatsapp_note', 'value', 'en', '"Call or message on WhatsApp"', true),
  ('setting', 'ui.common.call_us', 'value', 'fr', '"Nous appeler"', true),
  ('setting', 'ui.common.call_us', 'value', 'de', '"Uns anrufen"', true),
  ('setting', 'ui.common.call_us', 'value', 'it', '"Chiamarci"', true),
  ('setting', 'ui.common.call_us', 'value', 'en', '"Call us"', true)
on conflict (entity, entity_key, field, locale) do nothing;
