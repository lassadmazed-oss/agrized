-- 0131 · two corrections to the abroad page's words (0130), found on the page at 375px.
--
-- 1 · THE EXAMPLE NUMBER READ BACKWARDS. «+33 6 12 34 56 78» behind a left-to-right mark fixes where the number
--     starts but not the order of its groups: an Arabic line laid it out as «78 56 34 12 6 33+». The number is
--     now ISOLATED (U+2066 … U+2069), which keeps its groups in order.
--
-- 2 · «اختار النهار والوقت» — the form's time chips are buttons now (a radio came back unchecked after React
--     reset the form on a refused submit), so the page checks that a time was picked and says so in its own
--     words.
--
-- The marks are written as chr(8294) / chr(8297) / chr(8206), never as the invisible characters themselves.

-- The number alone is rewritten, inside whatever sentence the row holds now, so an owner's own wording around
-- it survives; a row that already isolates it is left alone.
update public.settings
set value = to_jsonb(regexp_replace(value #>> '{}', chr(8206) || '?\+33 6 12 34 56 78', chr(8294) || '+33 6 12 34 56 78' || chr(8297)))
where key in ('ui.abroad.whatsapp_hint', 'ui.abroad.error_whatsapp')
  and position(chr(8294) in value #>> '{}') = 0;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.abroad.error_pick_time', to_jsonb('اختار النهار والوقت اللي يناسبوك.'::text), 'text', 'ui',
   'غلطة: ما اختارش وقت', 'تظهر فوق الأوقات كي يبعث الزائر الفورم من غير ما يختار وقت.', true, 641)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.abroad.error_pick_time', 'value', 'fr', '"Choisissez le jour et l''heure qui vous conviennent."', true),
  ('setting', 'ui.abroad.error_pick_time', 'value', 'de', '"Bitte wählen Sie Tag und Uhrzeit."', true),
  ('setting', 'ui.abroad.error_pick_time', 'value', 'it', '"Scegli il giorno e l''ora che preferisci."', true),
  ('setting', 'ui.abroad.error_pick_time', 'value', 'en', '"Please pick a day and a time."', true)
on conflict (entity, entity_key, field, locale) do nothing;
