-- 0117 · خانة العدد — THE CALCULATOR'S «أدخل العدد» FITS ITS FIELD IN EVERY LANGUAGE.
--
-- The custom-number field on /start is about 110 pixels wide on a phone. «أدخل العدد» fits; its drafts
-- «Saisissez le nombre», «Enter the number» did not, and were cut mid-word inside the field. One word each —
-- drafts only, so a word the owner already saved stays his.

update public.translations t set value = d.value
from (values ('fr', '"Nombre"'::jsonb), ('de', '"Anzahl"'::jsonb), ('it', '"Numero"'::jsonb), ('en', '"Number"'::jsonb)) as d (locale, value)
where t.entity = 'setting' and t.entity_key = 'start.custom_placeholder' and t.field = 'value'
  and t.locale = d.locale and t.is_draft;
