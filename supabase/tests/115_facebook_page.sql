-- 0169 · the Facebook page on the site: one address, one label in five languages.

do $$
begin
  assert (select value #>> '{}' from public.settings where key = 'site.facebook_url' and is_public)
         like 'https://www.facebook.com/%', 'the page has a public https address on facebook.com';
  assert coalesce((select value #>> '{}' from public.settings where key = 'site.facebook_label' and is_public), '') <> '',
    'the link has words';
  assert (select count(*) from public.translations
          where entity = 'setting' and entity_key = 'site.facebook_label' and locale in ('fr', 'de', 'it', 'en')) = 4,
    'the four other sites name it too';
  -- 0173: the Back Office posts to the Page ID Meta Business Suite names, not the number in the public address.
  assert exists (select 1 from public.social_accounts where network = 'facebook' and external_id = '1275705932287730'),
    'the Back Office posts to the page by its Page ID';
end $$;
