-- A post from the Facebook page on the home page (owner, 2026-11-18: he sent Facebook's own embed code for the page's
-- photo fbid 122104396899428478 — the AGRIZED banner).
--
-- Test: supabase/tests/117_facebook_post.sql
--
-- TWO CLICKS, NOT ONE. The site sets no tracker and the privacy page says so; an iframe from facebook.com lets
-- Facebook set its own cookies the moment it loads. So the home page draws a card of its own — the page's name, a
-- sentence saying what loading it does, «ورّيني المنشور» and «حلّو على فايسبوك» — and frames the post only after the
-- visitor presses the button. The privacy page gains the section that says so, in its five languages.
--
-- Both the post and its height are settings: the owner changes the post by pasting another address.
-- site.facebook_post_height is the height Facebook's embed code gives at 500px wide; the page scales it.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.facebook_post_url', to_jsonb('https://www.facebook.com/photo/?fbid=122104396899428478&set=a.122104396929428478'::text), 'text', 'site',
   'منشور فايسبوك في الصفحة الرئيسية', 'رابط المنشور (Facebook ← ⋯ ← Intégrer، اللي بعد href=). فارغ يخبّي الكارت.', true, 107),
  ('site.facebook_post_height', to_jsonb(313), 'integer', 'site', 'طول منشور فايسبوك (بالبيكسال)',
   'الرقم height اللي في كود Intégrer متاع فايسبوك (للعرض 500).', true, 108),
  ('ui.fbpost.title', to_jsonb('من صفحتنا على فايسبوك'::text), 'text', 'ui', 'الصفحة الرئيسية: عنوان منشور فايسبوك', null, true, 5520),
  ('ui.fbpost.notice', to_jsonb('المنشور يتحلّ من فايسبوك كي تنزل على الزرّ، وفايسبوك ينجم ساعتها يحطّ الكوكيز متاعو.'::text), 'text', 'ui',
   'الصفحة الرئيسية: تنبيه قبل تحميل منشور فايسبوك', null, true, 5521),
  ('ui.fbpost.load', to_jsonb('ورّيني المنشور'::text), 'text', 'ui', 'الصفحة الرئيسية: زرّ تحميل منشور فايسبوك', null, true, 5522),
  ('ui.fbpost.open', to_jsonb('حلّو على فايسبوك'::text), 'text', 'ui', 'الصفحة الرئيسية: رابط المنشور على فايسبوك', null, true, 5523)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.fbpost.title', 'value', 'fr', to_jsonb('Sur notre page Facebook'::text), true),
  ('setting', 'ui.fbpost.title', 'value', 'de', to_jsonb('Auf unserer Facebook-Seite'::text), true),
  ('setting', 'ui.fbpost.title', 'value', 'it', to_jsonb('Dalla nostra pagina Facebook'::text), true),
  ('setting', 'ui.fbpost.title', 'value', 'en', to_jsonb('From our Facebook page'::text), true),
  ('setting', 'ui.fbpost.notice', 'value', 'fr', to_jsonb('La publication se charge depuis Facebook quand vous appuyez sur le bouton ; Facebook peut alors déposer ses cookies.'::text), true),
  ('setting', 'ui.fbpost.notice', 'value', 'de', to_jsonb('Der Beitrag wird erst beim Klick von Facebook geladen; Facebook kann dann seine Cookies setzen.'::text), true),
  ('setting', 'ui.fbpost.notice', 'value', 'it', to_jsonb('Il post si carica da Facebook quando premi il pulsante; Facebook può allora impostare i suoi cookie.'::text), true),
  ('setting', 'ui.fbpost.notice', 'value', 'en', to_jsonb('The post loads from Facebook when you press the button, and Facebook may then set its cookies.'::text), true),
  ('setting', 'ui.fbpost.load', 'value', 'fr', to_jsonb('Afficher la publication'::text), true),
  ('setting', 'ui.fbpost.load', 'value', 'de', to_jsonb('Beitrag anzeigen'::text), true),
  ('setting', 'ui.fbpost.load', 'value', 'it', to_jsonb('Mostra il post'::text), true),
  ('setting', 'ui.fbpost.load', 'value', 'en', to_jsonb('Show the post'::text), true),
  ('setting', 'ui.fbpost.open', 'value', 'fr', to_jsonb('Ouvrir sur Facebook'::text), true),
  ('setting', 'ui.fbpost.open', 'value', 'de', to_jsonb('Auf Facebook öffnen'::text), true),
  ('setting', 'ui.fbpost.open', 'value', 'it', to_jsonb('Apri su Facebook'::text), true),
  ('setting', 'ui.fbpost.open', 'value', 'en', to_jsonb('Open on Facebook'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

-- The privacy page says what loading it does, in each language it is read in.
do $$
declare
  v_ar jsonb := jsonb_build_object(
    'title', 'فيديوهات ومنشورات من مواقع أخرى',
    'body', 'الفيديوهات في صفحات العروض تتحلّ من YouTube بالنسخة اللي ما تحطّش كوكيز تتبّع، ولا من Vimeo بطلب «ما تتبّعنيش».' || chr(10) ||
            'منشور فايسبوك في الصفحة الرئيسية ما يتحلّش وحدو: يتحلّ كان كي تنزل على «ورّيني المنشور»، وساعتها فايسبوك ينجم يحطّ الكوكيز متاعو حسب سياسة الخصوصية متاعو. كان ما تنزلش، فايسبوك ما يوصلو شيء من الصفحة.');
  v_tr jsonb := jsonb_build_object(
    'fr', jsonb_build_object('title', 'Vidéos et publications d''autres sites',
      'body', 'Les vidéos des pages d''offres se chargent depuis YouTube en mode sans cookies de suivi, ou depuis Vimeo avec « ne pas me suivre ».' || chr(10) ||
              'La publication Facebook de la page d''accueil ne se charge pas toute seule : seulement si vous appuyez sur « Afficher la publication » ; Facebook peut alors déposer ses cookies selon sa propre politique. Sinon, rien de la page ne lui parvient.'),
    'de', jsonb_build_object('title', 'Videos und Beiträge anderer Websites',
      'body', 'Die Videos auf den Angebotsseiten laden von YouTube im Modus ohne Tracking-Cookies oder von Vimeo mit „Do Not Track“.' || chr(10) ||
              'Der Facebook-Beitrag auf der Startseite lädt nicht von selbst, sondern erst, wenn Sie auf „Beitrag anzeigen“ drücken; Facebook kann dann nach seiner eigenen Richtlinie Cookies setzen. Ohne Klick erhält Facebook nichts von der Seite.'),
    'it', jsonb_build_object('title', 'Video e post di altri siti',
      'body', 'I video delle pagine delle offerte si caricano da YouTube in modalità senza cookie di tracciamento, o da Vimeo con «non tracciarmi».' || chr(10) ||
              'Il post Facebook della home non si carica da solo: solo quando premi «Mostra il post»; Facebook può allora impostare i suoi cookie secondo la sua informativa. Altrimenti a Facebook non arriva nulla della pagina.'),
    'en', jsonb_build_object('title', 'Videos and posts from other sites',
      'body', 'Videos on offer pages load from YouTube in its no-tracking-cookie mode, or from Vimeo with “do not track”.' || chr(10) ||
              'The Facebook post on the home page does not load by itself: only when you press “Show the post”, and Facebook may then set its cookies under its own policy. If you do not, nothing from the page reaches Facebook.'));
  v_locale text;
begin
  update public.settings
     set value = value || jsonb_build_array(v_ar)
   where key = 'legal.privacy_sections' and jsonb_typeof(value) = 'array'
     and not exists (select 1 from jsonb_array_elements(value) e where e->>'title' = v_ar->>'title');

  for v_locale in select jsonb_object_keys(v_tr) loop
    update public.translations t
       set value = t.value || jsonb_build_array(v_tr->v_locale)
     where t.entity = 'setting' and t.entity_key = 'legal.privacy_sections' and t.field = 'value' and t.locale = v_locale
       and jsonb_typeof(t.value) = 'array'
       and not exists (select 1 from jsonb_array_elements(t.value) e where e->>'title' = v_tr->v_locale->>'title');
  end loop;

  update public.settings set value = to_jsonb('2026-11-18'::text) where key = 'legal.privacy_updated_at';
end $$;
