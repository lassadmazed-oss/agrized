-- 0156 · the three buttons §8 puts at the end of a study, and the line that follows them.
--
-- Its test is supabase/tests/103_study_actions.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0156_study_actions.sql supabase/tests/103_study_actions.sql
--
-- «كي الحريف يكمل الدراسة، يكون عنده 3 أزرار: حمّل دراستك PDF · سجّل اهتمامك بالمشروع · احجز زيارة للأرض».
--
-- THE PDF IS THE BROWSER'S OWN, and that is a decision rather than a shortcut. A server-rendered PDF means
-- a headless browser or a layout engine in the bundle, an Arabic font shipped with it, and a second
-- rendering of this page that would drift from the one on screen the first time either changed. The page
-- already exists, in the reader's own language, laid out right to left and paginated by his own browser;
-- `window.print()` turns it into exactly what he is looking at. What it needed was a print stylesheet, not
-- a dependency.
--
-- THE REFERENCE IS NOT DECORATION. A study is saved the moment one of the three is pressed, and the number
-- it comes back with is what a client reads down the phone to a commercial who then opens the same figures.
-- Without it the three buttons would produce a document nobody on this side can find again.

create temp table _study_action_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _study_action_texts values
  ('ui.study.download', 10, 'زرّ تحميل الدراسة', 'يفتح نافذة الطباعة متاع البراوزر، والقارئ يحفظها PDF.',
   'حمّل دراستك', 'Téléchargez votre étude', 'Studie herunterladen',
   'Scarica il tuo studio', 'Download your study'),

  ('ui.study.interest', 11, 'زرّ تسجيل الاهتمام من الدراسة', 'يوجّه لفورمولير العرض والدراسة تمشي معاه.',
   'سجّل اهتمامك بالمشروع', 'Manifestez votre intérêt', 'Interesse bekunden',
   'Manifesta il tuo interesse', 'Register your interest'),

  ('ui.study.visit', 12, 'زرّ حجز زيارة من الدراسة', '',
   'احجز زيارة للأرض', 'Réservez une visite du terrain', 'Besichtigung des Grundstücks buchen',
   'Prenota una visita al terreno', 'Book a visit to the land'),

  ('ui.study.saved', 13, 'سطر رقم الدراسة', 'يظهر بعد ما تتحفظ. {ref} = رقم الدراسة.',
   'دراستك محفوظة تحت رقم {ref} — اعطيه لفريقنا باش يشوفو نفس الأرقام.',
   'Votre étude est enregistrée sous le numéro {ref} — communiquez-le à notre équipe pour qu''elle voie les mêmes chiffres.',
   'Ihre Studie ist unter der Nummer {ref} gespeichert — nennen Sie sie unserem Team, damit es dieselben Zahlen sieht.',
   'Il tuo studio è salvato con il numero {ref} — comunicalo al nostro team per vedere gli stessi dati.',
   'Your study is saved under number {ref} — give it to our team so they see the same figures.'),

  ('ui.study.save_failed', 14, 'كي ما تتحفظش الدراسة', 'ما يمنعش الطباعة ولا باقي الأزرار.',
   'ما نجّمناش نحفظو الدراسة توّا. الأرقام اللي قدّامك صحيحة، وتنجّم تطبعها.',
   'Nous n''avons pas pu enregistrer l''étude pour le moment. Les chiffres affichés restent justes et vous pouvez les imprimer.',
   'Die Studie konnte gerade nicht gespeichert werden. Die angezeigten Zahlen stimmen und können gedruckt werden.',
   'Non siamo riusciti a salvare lo studio in questo momento. I dati mostrati sono corretti e puoi stamparli.',
   'We could not save the study just now. The figures on screen are still right and you can print them.');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 830 + sort
from _study_action_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _study_action_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
