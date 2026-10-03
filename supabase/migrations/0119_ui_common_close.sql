-- 0119 · «سكّر» — THE WORD ON THE LANGUAGE SHEET'S CLOSE BUTTON.
--
-- The language selector became a bottom sheet on the phone (owner, 2026-10-03: «cleaner and hell modern»), and
-- its close button needs a name a screen reader can say. A shared word, so it lives under ui.common and
-- travels to every page with the language and the units.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('ui.common.close', to_jsonb('سكّر'::text), 'text', 'ui', 'زر «سكّر»',
        'الاسم المسموع لزر الإغلاق في نافذة اختيار اللغة على التلفون.', true, 40)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.common.close', 'value', 'fr', '"Fermer"', true),
  ('setting', 'ui.common.close', 'value', 'de', '"Schließen"', true),
  ('setting', 'ui.common.close', 'value', 'it', '"Chiudi"', true),
  ('setting', 'ui.common.close', 'value', 'en', '"Close"', true)
on conflict (entity, entity_key, field, locale) do nothing;
