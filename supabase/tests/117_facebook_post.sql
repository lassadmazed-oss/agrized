-- 0171 · a Facebook post on the home page, loaded only on a click, and the privacy page saying so.

do $$
declare
  v_locale text;
begin
  assert (select value #>> '{}' from public.settings where key = 'site.facebook_post_url' and is_public)
         like 'https://www.facebook.com/%', 'the post is an address on facebook.com';
  assert (select (value #>> '{}')::integer from public.settings where key = 'site.facebook_post_height') between 150 and 2000,
    'its height is a sane number of pixels';
  assert (select count(*) from public.settings where key in ('ui.fbpost.title', 'ui.fbpost.notice', 'ui.fbpost.load', 'ui.fbpost.open')
            and coalesce(value #>> '{}', '') <> '') = 4, 'the card has its four sentences';
  assert (select count(*) from public.translations where entity = 'setting' and entity_key like 'ui.fbpost.%'
            and locale in ('fr', 'de', 'it', 'en')) = 16, 'in the four other languages too';

  -- The privacy page tells the truth about it, once, in every language.
  assert (select count(*) from jsonb_array_elements((select value from public.settings where key = 'legal.privacy_sections')) e
           where e->>'body' like '%فايسبوك%' and e->>'body' like '%ورّيني المنشور%') = 1, 'the Arabic privacy page says it';
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    assert (select count(*) from public.translations t, jsonb_array_elements(t.value) e
             where t.entity = 'setting' and t.entity_key = 'legal.privacy_sections' and t.locale = v_locale
               and e->>'body' like '%Facebook%'
               -- 0176's section on success stories names Facebook too; this one is «other sites».
               and e->>'title' ~* '(autres sites|anderer Websites|altri siti|other sites)') = 1, 'the ' || v_locale || ' privacy page says it';
  end loop;
end $$;
