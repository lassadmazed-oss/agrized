-- 0135 · «شارك · Partager» — THE WORDS OF THE SHARE BUTTON.
--
-- Owner, 2026-10-06: «add share button on the website, partager». One chooser (src/components/site/share-button.tsx)
-- opens from the header on every page, from each offer, from /abroad and from the virtual visit: WhatsApp,
-- Facebook, Telegram, e-mail, the link itself, and the phone's own share sheet. The shared link carries
-- `?ref=<channel>`, which SourceCapture already records, so the CRM can tell which shares brought people.
--
-- The chooser's words are shared by every page, so they live under ui.common and reach the browser with the
-- language; the three for /abroad («عندك صاحب ولا قريب برّا؟») and the tour's are their pages' own. Arabic in
-- the row, drafts in the four other languages for the owner to review.

create temp table _share_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _share_texts values
  ('ui.common.share', 55, 'زر «شارك»', 'الاسم المكتوب ولا المسموع لزر المشاركة في رأس الموقع وفي العروض.',
   'شارك', 'Partager', 'Teilen', 'Condividi', 'Share'),
  ('ui.common.share_title', 56, 'عنوان نافذة المشاركة', 'يظهر فوق الاختيارات (واتساب، فيسبوك…).',
   'شارك مع صحابك', 'Partager avec vos proches', 'Mit Freunden teilen', 'Condividi con i tuoi cari', 'Share with friends'),
  ('ui.common.share_facebook', 57, 'خيار فيسبوك', 'في نافذة المشاركة.',
   'فيسبوك', 'Facebook', 'Facebook', 'Facebook', 'Facebook'),
  ('ui.common.share_telegram', 58, 'خيار تيليغرام', 'في نافذة المشاركة.',
   'تيليغرام', 'Telegram', 'Telegram', 'Telegram', 'Telegram'),
  ('ui.common.share_email', 59, 'خيار الإيميل', 'في نافذة المشاركة.',
   'إيميل', 'E-mail', 'E-Mail', 'E-mail', 'Email'),
  ('ui.common.share_copy', 60, 'خيار نسخ الرابط', 'في نافذة المشاركة.',
   'انسخ الرابط', 'Copier le lien', 'Link kopieren', 'Copia il link', 'Copy link'),
  ('ui.common.share_copied', 61, 'بعد نسخ الرابط', 'يتبدّل بيه «انسخ الرابط» كي يتنسخ.',
   'تنسخ الرابط', 'Lien copié', 'Link kopiert', 'Link copiato', 'Link copied'),
  ('ui.common.share_more', 62, 'خيار «تطبيقات أخرى»', 'يظهر في التلفون برك: يحلّ قائمة المشاركة متاع التلفون.',
   'تطبيقات أخرى', 'Autres applications', 'Andere Apps', 'Altre app', 'Other apps'),
  ('ui.common.share_offer', 63, 'زر «شارك العرض»', 'في صفحة العرض على الكمبيوتر.',
   'شارك العرض', 'Partager l''offre', 'Angebot teilen', 'Condividi l''offerta', 'Share this offer'),
  ('ui.abroad.share_title', 70, 'عنوان «عندك صاحب برّا؟»', 'في صفحة /abroad: يدعي الزائر يبعث الصفحة لواحد يعرفو عايش برّا.',
   'عندك صاحب ولا قريب برّا؟', 'Un proche vit à l''étranger ?', 'Lebt jemand, den Sie kennen, im Ausland?',
   'Hai un parente o un amico all''estero?', 'Know someone living abroad?'),
  ('ui.abroad.share_text', 71, 'شرح «عندك صاحب برّا؟»', '',
   'ابعثلو الصفحة هاذي: زيتونتو في البلاد تستناه.', 'Envoyez-lui cette page : son olivier l''attend au pays.',
   'Schicken Sie ihm diese Seite: Sein Olivenbaum wartet zu Hause.', 'Mandagli questa pagina: il suo ulivo lo aspetta a casa.',
   'Send them this page: their olive tree is waiting back home.'),
  ('ui.abroad.share_cta', 72, 'زر «ابعثها»', 'يحلّ نافذة المشاركة.',
   'ابعثها لصاحبك اللي برّا', 'L''envoyer à un proche', 'An jemanden schicken', 'Mandala a qualcuno', 'Send it to them'),
  ('ui.abroad.share_message', 73, 'الجملة اللي تمشي مع الرابط', 'تتبعث مع رابط الصفحة في واتساب، تيليغرام ولا الإيميل.',
   'زيتونتك في البلاد تستناك. شوف كيفاش تزورها من برّا:', 'Ton olivier t''attend au pays. Regarde comment le visiter depuis l''étranger :',
   'Dein Olivenbaum wartet zu Hause. So besuchst du ihn aus dem Ausland:', 'Il tuo ulivo ti aspetta a casa. Guarda come visitarlo dall''estero:',
   'Your olive tree is waiting back home. See how to visit it from abroad:'),
  ('ui.tour.share', 87, 'زر «شارك الزيارة»', 'فوق في الزيارة الافتراضية، حذا زر الوقوف.',
   'شارك الزيارة', 'Partager la visite', 'Rundgang teilen', 'Condividi la visita', 'Share the visit');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true,
       case when key like 'ui.common.%' then sort else 600 + sort end
from _share_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _share_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
