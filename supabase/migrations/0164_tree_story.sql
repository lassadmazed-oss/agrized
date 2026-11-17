-- «لمن الزيتونة؟» and a name for the tree: the story the platform tells before any price (owner, 2026-11-17:
-- «نحب الحكاية تتحكى في الانترفاس … نخلقو الفكرة في راسه»).
--
-- Test: supabase/tests/110_tree_story.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0164_tree_story.sql supabase/tests/110_tree_story.sql
--
-- 1 · A list «tree_for» (Back Office → القوائم): for me, my child, my parents, a gift, my family from abroad. Each
--     answer has its line (start.for_lines, one pair per code like start.tier_taglines). /start asks it first and
--     the home page offers it as a way in (/start?for=<id>).
-- 2 · The name the visitor gives the tree, on a certificate preview at the end of /start. Optional, 40 characters.
-- 3 · Both travel with the demand: interest_requests.tree_for_option_id (+ the label as it read that day) and
--     tree_name, so the commercial who calls knows whose tree it is and what it is called.
-- No promise is made anywhere: the lines are about who the tree is for, never about what it earns.

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('tree_for', 'لمن الزيتونة؟', 'code', 'أوّل سؤال في الحاسبة وباب في الصفحة الرئيسية. الرمز يربط كل قيمة بسطر حكايتها في start.for_lines.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_for', 'self', 'لروحي', 'Pour moi', 10
where not exists (select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = 'self');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Pour moi'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'self'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Für mich'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'self'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Per me'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'self'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('For me'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'self'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_for', 'child', 'لولدي ولا بنتي', 'Pour mon enfant', 20
where not exists (select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = 'child');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Pour mon enfant'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'child'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Für mein Kind'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'child'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Per mio figlio o mia figlia'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'child'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('For my child'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'child'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_for', 'parent', 'لأمّي ولا بويا', 'Pour mes parents', 30
where not exists (select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = 'parent');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Pour mes parents'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'parent'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Für meine Eltern'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'parent'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Per i miei genitori'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'parent'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('For my parents'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'parent'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_for', 'gift', 'هدية', 'En cadeau', 40
where not exists (select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = 'gift');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('En cadeau'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'gift'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Als Geschenk'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'gift'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('In regalo'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'gift'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('As a gift'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'gift'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order)
select 'tree_for', 'abroad', 'لعايلتي وأنا برّا', 'Pour ma famille, depuis l''étranger', 50
where not exists (select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = 'abroad');
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'fr', to_jsonb('Pour ma famille, depuis l''étranger'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'abroad'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'de', to_jsonb('Für meine Familie, aus dem Ausland'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'abroad'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'it', to_jsonb('Per la mia famiglia, dall''estero'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'abroad'
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', 'en', to_jsonb('For my family, from abroad'::text), true
from public.option_items o where o.list_key = 'tree_for' and o.code = 'abroad'
on conflict (entity, entity_key, field, locale) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.for_lines', '{"self":{"ar":"أصل باسمك، يكبر معاك عام بعد عام.","fr":"Un bien à votre nom, qui grandit avec vous année après année."},"child":{"ar":"تتغرس وهو صغير، وتكبر معاه. كي يكبر، تكون هي كبرت زادا.","fr":"Planté quand il est petit, l''olivier grandit avec lui."},"parent":{"ar":"زيتونة باسمهم، وزيت منها في كوجينتهم.","fr":"Un olivier à leur nom, et son huile dans leur cuisine."},"gift":{"ar":"هدية تعيش: في عرس، في نجاح، في عيد ميلاد.","fr":"Un cadeau vivant : un mariage, une réussite, un anniversaire."},"abroad":{"ar":"جذورك في تونس، تتابعها من تلفونك وين ما كنت.","fr":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez."}}'::jsonb, 'json', 'start', 'الحاسبة: سطر الحكاية لكل «لمن الزيتونة؟»',
   'سطر واحد لكل رمز من قائمة tree_for، بالعربي (ar) وبالفرنسي (fr) تحتو.', true, 2050)
on conflict (key) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'start.for_lines', 'value', 'fr', '{"self":{"ar":"Un bien à votre nom, qui grandit avec vous année après année.","fr":"Un bien à votre nom, qui grandit avec vous année après année."},"child":{"ar":"Planté quand il est petit, l''olivier grandit avec lui.","fr":"Planté quand il est petit, l''olivier grandit avec lui."},"parent":{"ar":"Un olivier à leur nom, et son huile dans leur cuisine.","fr":"Un olivier à leur nom, et son huile dans leur cuisine."},"gift":{"ar":"Un cadeau vivant : un mariage, une réussite, un anniversaire.","fr":"Un cadeau vivant : un mariage, une réussite, un anniversaire."},"abroad":{"ar":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez.","fr":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez."}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'start.for_lines', 'value', 'de', '{"self":{"ar":"Ein Wert auf Ihren Namen, der Jahr für Jahr mit Ihnen wächst.","fr":"Un bien à votre nom, qui grandit avec vous année après année."},"child":{"ar":"Gepflanzt, solange es klein ist, wächst der Baum mit Ihrem Kind.","fr":"Planté quand il est petit, l''olivier grandit avec lui."},"parent":{"ar":"Ein Olivenbaum auf ihren Namen, und sein Öl in ihrer Küche.","fr":"Un olivier à leur nom, et son huile dans leur cuisine."},"gift":{"ar":"Ein lebendiges Geschenk: Hochzeit, Erfolg, Geburtstag.","fr":"Un cadeau vivant : un mariage, une réussite, un anniversaire."},"abroad":{"ar":"Ihre Wurzeln in Tunesien, verfolgt vom Handy aus, wo immer Sie sind.","fr":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez."}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'start.for_lines', 'value', 'it', '{"self":{"ar":"Un bene a tuo nome, che cresce con te anno dopo anno.","fr":"Un bien à votre nom, qui grandit avec vous année après année."},"child":{"ar":"Piantato quando è piccolo, l''olivo cresce con lui.","fr":"Planté quand il est petit, l''olivier grandit avec lui."},"parent":{"ar":"Un olivo a loro nome, e il suo olio nella loro cucina.","fr":"Un olivier à leur nom, et son huile dans leur cuisine."},"gift":{"ar":"Un regalo vivo: un matrimonio, un successo, un compleanno.","fr":"Un cadeau vivant : un mariage, une réussite, un anniversaire."},"abroad":{"ar":"Le tue radici in Tunisia, seguite dal telefono ovunque tu sia.","fr":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez."}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'start.for_lines', 'value', 'en', '{"self":{"ar":"Something real in your name, growing with you year after year.","fr":"Un bien à votre nom, qui grandit avec vous année après année."},"child":{"ar":"Planted while they are small, the tree grows up with them.","fr":"Planté quand il est petit, l''olivier grandit avec lui."},"parent":{"ar":"An olive tree in their name, and its oil in their kitchen.","fr":"Un olivier à leur nom, et son huile dans leur cuisine."},"gift":{"ar":"A gift that lives: a wedding, a success, a birthday.","fr":"Un cadeau vivant : un mariage, une réussite, un anniversaire."},"abroad":{"ar":"Your roots in Tunisia, followed from your phone wherever you are.","fr":"Vos racines en Tunisie, suivies depuis votre téléphone où que vous soyez."}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.for_title', to_jsonb('لمن الزيتونة؟'::text), 'text', 'start', 'الحاسبة: سؤال لمن الزيتونة', null, true, 2051),
  ('start.for_title_fr', to_jsonb('Pour qui est l''olivier ?'::text), 'text', 'start', 'الحاسبة: سؤال لمن الزيتونة (الفرنسي تحت العربي)', null, true, 2052),
  ('start.for_subtitle', to_jsonb('كل زيتونة عندها حكاية. اختار حكايتك.'::text), 'text', 'start', 'الحاسبة: شرح سؤال لمن الزيتونة', null, true, 2053),
  ('start.for_subtitle_fr', to_jsonb('Chaque olivier a son histoire. Choisissez la vôtre.'::text), 'text', 'start', 'الحاسبة: شرح سؤال لمن الزيتونة (الفرنسي تحت العربي)', null, true, 2054),
  ('start.cert_title', to_jsonb('شهادة زيتونتك'::text), 'text', 'start', 'الحاسبة: عنوان الشهادة', null, true, 2055),
  ('start.cert_title_fr', to_jsonb('Votre certificat d''olivier'::text), 'text', 'start', 'الحاسبة: عنوان الشهادة (الفرنسي تحت العربي)', null, true, 2056),
  ('start.cert_badge', to_jsonb('معاينة'::text), 'text', 'start', 'الحاسبة: علامة المعاينة', null, true, 2057),
  ('start.cert_badge_fr', to_jsonb('Aperçu'::text), 'text', 'start', 'الحاسبة: علامة المعاينة (الفرنسي تحت العربي)', null, true, 2058),
  ('start.cert_name_label', to_jsonb('شنوّة تسمّيها؟'::text), 'text', 'start', 'الحاسبة: سؤال الاسم', null, true, 2059),
  ('start.cert_name_label_fr', to_jsonb('Quel nom lui donner ?'::text), 'text', 'start', 'الحاسبة: سؤال الاسم (الفرنسي تحت العربي)', null, true, 2060),
  ('start.cert_name_placeholder', to_jsonb('مثال: زيتونة ياسمين'::text), 'text', 'start', 'الحاسبة: مثال الاسم', null, true, 2061),
  ('start.cert_name_placeholder_fr', to_jsonb('Ex. : l''olivier de Yasmine'::text), 'text', 'start', 'الحاسبة: مثال الاسم (الفرنسي تحت العربي)', null, true, 2062),
  ('start.cert_name_hint', to_jsonb('اختياري. الاسم يتكتب في الشهادة متاعك.'::text), 'text', 'start', 'الحاسبة: شرح الاسم', null, true, 2063),
  ('start.cert_name_hint_fr', to_jsonb('Facultatif. Le nom figurera sur votre certificat.'::text), 'text', 'start', 'الحاسبة: شرح الاسم (الفرنسي تحت العربي)', null, true, 2064),
  ('start.cert_default_name', to_jsonb('زيتونتك'::text), 'text', 'start', 'الحاسبة: الاسم كي يكون فارغ', null, true, 2065),
  ('start.cert_default_name_fr', to_jsonb('Votre olivier'::text), 'text', 'start', 'الحاسبة: الاسم كي يكون فارغ (الفرنسي تحت العربي)', null, true, 2066),
  ('start.cert_for', to_jsonb('{for}'::text), 'text', 'start', 'الحاسبة: سطر لمن في الشهادة ({for} = الجواب، مثلاً «لولدي ولا بنتي»)', null, true, 2067),
  ('start.cert_for_fr', to_jsonb('{for}'::text), 'text', 'start', 'الحاسبة: سطر لمن في الشهادة ({for} = الجواب، مثلاً «لولدي ولا بنتي») (الفرنسي تحت العربي)', null, true, 2068),
  ('start.cert_pending', to_jsonb('رقمها في العرض وموقعها (GPS) يتعطاو كي تحجز.'::text), 'text', 'start', 'الحاسبة: الرقم والموقع بعد الحجز', null, true, 2069),
  ('start.cert_pending_fr', to_jsonb('Son numéro et sa position GPS vous sont donnés à la réservation.'::text), 'text', 'start', 'الحاسبة: الرقم والموقع بعد الحجز (الفرنسي تحت العربي)', null, true, 2070),
  ('home.for_title', to_jsonb('لمن الزيتونة؟'::text), 'text', 'home', 'الصفحة الرئيسية: لمن الزيتونة', null, true, 2071),
  ('home.for_subtitle', to_jsonb('كل زيتونة عندها حكاية. اختار حكايتك، ونحسبولك على قدّها.'::text), 'text', 'home', 'الصفحة الرئيسية: شرح لمن الزيتونة', null, true, 2072)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'start.for_title', 'value', 'fr', to_jsonb('Pour qui est l''olivier ?'::text), true),
  ('setting', 'start.for_title', 'value', 'de', to_jsonb('Für wen ist der Olivenbaum?'::text), true),
  ('setting', 'start.for_title', 'value', 'it', to_jsonb('Per chi è l''olivo?'::text), true),
  ('setting', 'start.for_title', 'value', 'en', to_jsonb('Who is the olive tree for?'::text), true),
  ('setting', 'start.for_subtitle', 'value', 'fr', to_jsonb('Chaque olivier a son histoire. Choisissez la vôtre.'::text), true),
  ('setting', 'start.for_subtitle', 'value', 'de', to_jsonb('Jeder Olivenbaum hat seine Geschichte. Wählen Sie Ihre.'::text), true),
  ('setting', 'start.for_subtitle', 'value', 'it', to_jsonb('Ogni olivo ha la sua storia. Scegli la tua.'::text), true),
  ('setting', 'start.for_subtitle', 'value', 'en', to_jsonb('Every olive tree has a story. Choose yours.'::text), true),
  ('setting', 'start.cert_title', 'value', 'fr', to_jsonb('Votre certificat d''olivier'::text), true),
  ('setting', 'start.cert_title', 'value', 'de', to_jsonb('Ihr Olivenbaum-Zertifikat'::text), true),
  ('setting', 'start.cert_title', 'value', 'it', to_jsonb('Il tuo certificato d''olivo'::text), true),
  ('setting', 'start.cert_title', 'value', 'en', to_jsonb('Your olive tree certificate'::text), true),
  ('setting', 'start.cert_badge', 'value', 'fr', to_jsonb('Aperçu'::text), true),
  ('setting', 'start.cert_badge', 'value', 'de', to_jsonb('Vorschau'::text), true),
  ('setting', 'start.cert_badge', 'value', 'it', to_jsonb('Anteprima'::text), true),
  ('setting', 'start.cert_badge', 'value', 'en', to_jsonb('Preview'::text), true),
  ('setting', 'start.cert_name_label', 'value', 'fr', to_jsonb('Quel nom lui donner ?'::text), true),
  ('setting', 'start.cert_name_label', 'value', 'de', to_jsonb('Welchen Namen soll er tragen?'::text), true),
  ('setting', 'start.cert_name_label', 'value', 'it', to_jsonb('Che nome dargli?'::text), true),
  ('setting', 'start.cert_name_label', 'value', 'en', to_jsonb('What will you call it?'::text), true),
  ('setting', 'start.cert_name_placeholder', 'value', 'fr', to_jsonb('Ex. : l''olivier de Yasmine'::text), true),
  ('setting', 'start.cert_name_placeholder', 'value', 'de', to_jsonb('z. B. Yasmines Olivenbaum'::text), true),
  ('setting', 'start.cert_name_placeholder', 'value', 'it', to_jsonb('Es.: l''olivo di Yasmine'::text), true),
  ('setting', 'start.cert_name_placeholder', 'value', 'en', to_jsonb('e.g. Yasmine''s olive tree'::text), true),
  ('setting', 'start.cert_name_hint', 'value', 'fr', to_jsonb('Facultatif. Le nom figurera sur votre certificat.'::text), true),
  ('setting', 'start.cert_name_hint', 'value', 'de', to_jsonb('Freiwillig. Der Name steht auf Ihrem Zertifikat.'::text), true),
  ('setting', 'start.cert_name_hint', 'value', 'it', to_jsonb('Facoltativo. Il nome apparirà sul tuo certificato.'::text), true),
  ('setting', 'start.cert_name_hint', 'value', 'en', to_jsonb('Optional. The name will be written on your certificate.'::text), true),
  ('setting', 'start.cert_default_name', 'value', 'fr', to_jsonb('Votre olivier'::text), true),
  ('setting', 'start.cert_default_name', 'value', 'de', to_jsonb('Ihr Olivenbaum'::text), true),
  ('setting', 'start.cert_default_name', 'value', 'it', to_jsonb('Il tuo olivo'::text), true),
  ('setting', 'start.cert_default_name', 'value', 'en', to_jsonb('Your olive tree'::text), true),
  ('setting', 'start.cert_for', 'value', 'fr', to_jsonb('{for}'::text), true),
  ('setting', 'start.cert_for', 'value', 'de', to_jsonb('{for}'::text), true),
  ('setting', 'start.cert_for', 'value', 'it', to_jsonb('{for}'::text), true),
  ('setting', 'start.cert_for', 'value', 'en', to_jsonb('{for}'::text), true),
  ('setting', 'start.cert_pending', 'value', 'fr', to_jsonb('Son numéro et sa position GPS vous sont donnés à la réservation.'::text), true),
  ('setting', 'start.cert_pending', 'value', 'de', to_jsonb('Nummer und GPS-Position erhalten Sie bei der Reservierung.'::text), true),
  ('setting', 'start.cert_pending', 'value', 'it', to_jsonb('Numero e posizione GPS ti vengono dati alla prenotazione.'::text), true),
  ('setting', 'start.cert_pending', 'value', 'en', to_jsonb('Its number and GPS position are given when you reserve.'::text), true),
  ('setting', 'home.for_title', 'value', 'fr', to_jsonb('Pour qui est l''olivier ?'::text), true),
  ('setting', 'home.for_title', 'value', 'de', to_jsonb('Für wen ist der Olivenbaum?'::text), true),
  ('setting', 'home.for_title', 'value', 'it', to_jsonb('Per chi è l''olivo?'::text), true),
  ('setting', 'home.for_title', 'value', 'en', to_jsonb('Who is the olive tree for?'::text), true),
  ('setting', 'home.for_subtitle', 'value', 'fr', to_jsonb('Chaque olivier a son histoire. Choisissez la vôtre, nous calculons le reste.'::text), true),
  ('setting', 'home.for_subtitle', 'value', 'de', to_jsonb('Jeder Olivenbaum hat seine Geschichte. Wählen Sie Ihre, wir rechnen den Rest.'::text), true),
  ('setting', 'home.for_subtitle', 'value', 'it', to_jsonb('Ogni olivo ha la sua storia. Scegli la tua, al resto pensiamo noi.'::text), true),
  ('setting', 'home.for_subtitle', 'value', 'en', to_jsonb('Every olive tree has a story. Choose yours and we work out the rest.'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

-- The demand keeps both answers, with the label as it read that day (like every other choice on it).
alter table public.interest_requests
  add column if not exists tree_for_option_id uuid references public.option_items (id),
  add column if not exists tree_for_label_ar  text,
  add column if not exists tree_name          text;
alter table public.interest_requests drop constraint if exists interest_requests_tree_name_check;
alter table public.interest_requests add constraint interest_requests_tree_name_check
  check (tree_name is null or (char_length(tree_name) between 1 and 40));
comment on column public.interest_requests.tree_for_option_id is
  'Who the tree is for (list tree_for, 0164): for me, my child, my parents, a gift, my family from abroad.';
comment on column public.interest_requests.tree_name is
  'The name the visitor gave the tree on /start (0164), up to 40 characters. Printed on their certificate.';

-- ---------------------------------------------------------------------------
-- public.submit_interest_request, as production runs it (0163), reading the two answers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_interest_request(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- «من المواطنين بالخارج» (owner, 2026-10-03). Absent means no, never unknown: the question is a
  -- checkbox, so a payload without it is a visitor who did not tick it.
  v_abroad boolean := coalesce((p->>'lives_abroad')::boolean, false);
  -- 0164: who the tree is for (a tree_for option; an unknown id is simply not kept) and the name it was given.
  v_for       public.option_items := app.active_option('tree_for', p->>'tree_for_option_id');
  v_tree_name text := nullif(left(btrim(regexp_replace(coalesce(p->>'tree_name', ''), '[[:cntrl:]]', '', 'g')), 40), '');
  v_name         text := btrim(coalesce(p->>'full_name', ''));
  v_phone        text := p->>'phone_e164';
  v_whatsapp     text := nullif(p->>'whatsapp_e164', '');
  v_email        text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov          smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del          integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_anywhere     boolean := coalesce((p->>'invest_anywhere')::boolean, false);
  v_unsure       boolean := coalesce((p->>'project_type_unsure')::boolean, false);
  v_consent      text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_invest_govs  smallint[];
  v_types        uuid[];
  v_scenarios    uuid[];
  v_scn_labels   text[] := '{}';
  v_plantation   text[] := '{}';
  v_production   text[] := '{}';
  v_any_scenario boolean := false;
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_percent      public.option_items;
  v_inst         public.option_items;
  v_duration     public.option_items;
  v_budget       public.option_items;
  v_time         public.option_items;
  v_area         public.option_items;
  v_trees        public.option_items;
  v_custom       integer;
  v_priority     public.option_items;
  -- Optional yes/no answers: only a JSON boolean counts, anything else is «no answer», never an error.
  v_wants_visit  boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
  v_wants_bank   boolean := case when jsonb_typeof(p->'wants_bank_financing') = 'boolean'
                                 then (p->>'wants_bank_financing')::boolean end;
  v_payment_mode text := nullif(btrim(coalesce(p->>'payment_mode', '')), '');
  v_spacing      public.tree_spacing_classes;
  v_tree_n       integer;
  v_trees_label  text;
  v_total_area   numeric;
  v_price        jsonb;
  v_quote        jsonb;
  v_price_tree   bigint;
  v_price_total  bigint;
  v_down_amount  bigint;
  v_financed     bigint;
  v_monthly      bigint;
  v_status_id    uuid;
  v_person_id    uuid;
  v_inserted     boolean;
  v_assignee     uuid;
  v_year         text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no   text;
  v_request_id   uuid;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  -- Residence: governorate required, delegation optional but checked when given.
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;

  -- Where to invest
  select coalesce(array_agg(distinct x::smallint), '{}') into v_invest_govs
  from jsonb_array_elements_text(coalesce(p->'invest_governorate_ids', '[]'::jsonb)) x;
  if v_anywhere then
    v_invest_govs := '{}';
  elsif cardinality(v_invest_govs) = 0 then
    raise exception 'invest_location_required' using errcode = 'P0001';
  elsif (select count(*) from public.governorates g where g.id = any (v_invest_govs) and g.is_active)
        <> cardinality(v_invest_govs) then
    raise exception 'invalid_invest_governorate' using errcode = 'P0001';
  end if;

  -- What the citizen wants to own (clause 25.3). Scenarios decide the project types.
  select coalesce(array_agg(distinct x::uuid), '{}') into v_scenarios
  from jsonb_array_elements_text(coalesce(p->'scenario_ids', '[]'::jsonb)) x;

  if cardinality(v_scenarios) > 0 then
    if (select count(*) from public.ownership_scenarios s where s.id = any (v_scenarios) and s.is_active)
       <> cardinality(v_scenarios) then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end if;
    if not app.setting_bool('lead.project_types_multi', true) and cardinality(v_scenarios) > 1 then
      raise exception 'single_scenario_only' using errcode = 'P0001';
    end if;

    select
      coalesce(array_agg(distinct s.project_type_id) filter (where s.project_type_id is not null), '{}'),
      coalesce(array_agg(s.label_ar order by s.sort_order), '{}'),
      coalesce(array_agg(distinct s.plantation_system) filter (where s.plantation_system is not null), '{}'),
      coalesce(array_agg(distinct s.production_status) filter (where s.production_status is not null), '{}'),
      bool_or(s.is_any)
    into v_types, v_scn_labels, v_plantation, v_production, v_any_scenario
    from public.ownership_scenarios s
    where s.id = any (v_scenarios);

    if v_any_scenario then
      v_types := '{}';
    end if;
    v_unsure := v_any_scenario or cardinality(v_types) = 0;
  else
    -- Fallback for callers that still send project types directly.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_types
    from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
    if v_unsure then
      v_types := '{}';
    elsif cardinality(v_types) = 0 then
      -- Plan Q-6: the offer type is an optional question; no answer is recorded as «no specific type».
      v_unsure := true;
    elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
      raise exception 'single_project_type_only' using errcode = 'P0001';
    elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
          <> cardinality(v_types) then
      raise exception 'invalid_project_type' using errcode = 'P0001';
    end if;
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  -- Addendum «طريقة الدفع»: a cash buyer picks no down payment, duration or installment; ids sent anyway are ignored.
  if v_payment_mode is not null and v_payment_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;
  -- Plan Q-1/Q-2: the down payment is a percentage of the cash total, chosen once on /start.
  if nullif(p->>'down_payment_percent_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_percent := app.active_option('down_payment_percent', p->>'down_payment_percent_option_id');
    if v_percent.id is null then raise exception 'invalid_down_payment_percent' using errcode = 'P0001'; end if;
  end if;
  -- Plan Q-7: the amount list is retired; a legacy caller that still sends an amount is checked and snapshotted.
  if nullif(p->>'down_payment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_down := app.active_option('down_payment', p->>'down_payment_option_id');
    if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §6: the client no longer picks a monthly amount; older callers may still send one.
  if nullif(p->>'installment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
    if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §8: the payment duration, in months
  if nullif(p->>'duration_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_duration := app.active_option('duration', p->>'duration_option_id');
    if v_duration.id is null then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  end if;
  -- Installments need a percentage and a duration, as long as the Back Office offers any.
  if v_payment_mode = 'installments' then
    if v_percent.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'down_payment_percent' and o.is_active) then
      raise exception 'down_payment_percent_required' using errcode = 'P0001';
    end if;
    if v_duration.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'duration' and o.is_active) then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;
  end if;
  -- Report v3 §40: the overall budget
  if nullif(p->>'budget_option_id', '') is not null then
    v_budget := app.active_option('budget', p->>'budget_option_id');
    if v_budget.id is null then raise exception 'invalid_budget' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'desired_area_option_id', '') is not null then
    v_area := app.active_option('desired_area', p->>'desired_area_option_id');
    if v_area.id is null then raise exception 'invalid_desired_area' using errcode = 'P0001'; end if;
  end if;
  -- MIL-01 · how many olive trees the citizen wants to start with
  if nullif(p->>'tree_count_option_id', '') is not null then
    v_trees := app.active_option('tree_count', p->>'tree_count_option_id');
    if v_trees.id is null then raise exception 'invalid_tree_choice' using errcode = 'P0001'; end if;
  end if;
  -- ... or a number typed on /start. The database stays strict: Western digits only, the page converts.
  begin
    v_custom := nullif(btrim(coalesce(p->>'tree_count_custom', '')), '')::integer;
  exception when others then
    raise exception 'invalid_tree_custom' using errcode = 'P0001';
  end;
  if v_custom is not null then
    if nullif(p->>'tree_count_option_id', '') is not null then
      raise exception 'invalid_tree_choice' using errcode = 'P0001';
    end if;
    if v_custom < app.setting_int('million.custom_trees_min', 1)
       or v_custom > app.setting_int('million.custom_trees_max', 5000) then
      raise exception 'invalid_tree_custom' using errcode = 'P0001';
    end if;
  end if;
  -- Addendum: the spacing class sets the area attached to each tree
  if nullif(p->>'spacing_class_id', '') is not null then
    select * into v_spacing from public.tree_spacing_classes c
    where c.id::text = p->>'spacing_class_id' and c.is_active;
    if v_spacing.id is null then raise exception 'invalid_spacing' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'priority_option_id', '') is not null then
    v_priority := app.active_option('priority', p->>'priority_option_id');
    if v_priority.id is null then raise exception 'invalid_priority' using errcode = 'P0001'; end if;
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;

  -- Throttling (LEAD-06)
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- One person per phone (LEAD-04). Existing person data is never overwritten from the public form.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at, lives_abroad)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now(), v_abroad)
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at,
        lives_abroad = excluded.lives_abroad
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12)
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  -- The figures shown on /start, recomputed here so a demand never carries a price the client could not see.
  v_tree_n      := case when v_custom is null then v_trees.min_number::integer else v_custom end;
  v_trees_label := case when v_custom is null then v_trees.label_ar
                        else v_custom::text || ' ' || app.setting_text('start.trees_unit', 'زيتونة') end;
  v_total_area  := v_spacing.area_m2 * v_tree_n;
  if v_spacing.id is not null and v_tree_n is not null and app.module_open('pricing') then
    v_price := app.tree_price(v_spacing.id, null);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_price_tree  := (v_price->>'price_per_tree_millimes')::bigint;
      v_price_total := v_price_tree * v_tree_n;
      if v_payment_mode = 'installments' and v_percent.id is not null and v_duration.id is not null then
        -- Plan Q-2: the same percentage of the same cash total as public_tree_quote, so the figures match /start.
        v_quote := app.financed_quote(v_price_total,
                                      app.down_payment_from_percent(v_price_total, v_percent.min_number, null),
                                      v_duration.min_number::integer, null);
        if coalesce((v_quote->>'ok')::boolean, false) then
          v_down_amount := (v_quote->>'down_payment_millimes')::bigint;
          v_financed    := (v_quote->>'total_financed_millimes')::bigint;
          v_monthly     := (v_quote->>'monthly_millimes')::bigint;
        end if;
      end if;
    end if;
  end if;

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id, lives_abroad,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    scenario_ids, scenario_labels, plantation_systems, production_statuses,
    tree_count_option_id, tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    desired_area_option_id, desired_area_label_ar, desired_area_min_m2, desired_area_max_m2,
    priority_option_id, priority_code, priority_label_ar,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    duration_option_id, duration_label_ar, duration_months,
    budget_option_id, budget_label_ar, budget_min_millimes, budget_max_millimes,
    wants_visit, wants_bank_financing,
    spacing_class_id, spacing_label_ar, area_per_tree_m2, total_area_m2, payment_mode,
    price_per_tree_millimes, total_price_millimes,
    down_payment_percent_option_id, down_payment_percent, down_payment_amount_millimes,
    total_financed_millimes, monthly_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text,
    tree_for_option_id, tree_for_label_ar, tree_name
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del, v_abroad,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_scenarios, v_scn_labels, v_plantation, v_production,
    case when v_custom is null then v_trees.id end,
    case when v_custom is null then v_trees.code else 'custom' end,
    v_trees_label,
    v_tree_n,
    case when v_custom is null then v_trees.max_number::integer else v_custom end,
    v_area.id, v_area.label_ar, v_area.min_number, v_area.max_number,
    v_priority.id, v_priority.code, v_priority.label_ar,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_duration.id, v_duration.label_ar, v_duration.min_number::integer,
    v_budget.id, v_budget.label_ar, v_budget.min_millimes, v_budget.max_millimes,
    v_wants_visit, v_wants_bank,
    v_spacing.id, v_spacing.label_ar, v_spacing.area_m2, v_total_area, v_payment_mode,
    v_price_tree, v_price_total,
    v_percent.id, v_percent.min_number, v_down_amount,
    v_financed, v_monthly,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent,
    v_for.id, v_for.label_ar, v_tree_name
  ) returning id into v_request_id;

  -- Plan P2-4: the summary figures travel with the message, ready for a template that names them.
  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no,
                       'trees', v_trees_label, 'total_area_m2', v_total_area, 'total_price_millimes', v_price_total),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $function$;
