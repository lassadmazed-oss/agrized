-- 0140 · the privacy policy is readable by a stranger, says something in every block it draws, and the
-- footer finally has a link that resolves.

do $$
declare
  v_key      text;
  v_sections jsonb;
  v_section  jsonb;
  v_count    integer := 0;
begin
  -- A store's crawler reads this page without a session. Every row it needs must be public or the page
  -- renders blank for exactly the reader it exists for.
  foreach v_key in array array[
    'legal.privacy_title', 'legal.privacy_intro', 'legal.privacy_sections', 'legal.privacy_contact',
    'legal.privacy_updated_at', 'legal.entity_name', 'legal.privacy_email'
  ] loop
    assert exists (select 1 from public.settings s where s.key = v_key),
      format('%s is missing, so the privacy page has a hole in it', v_key);
    assert (select s.is_public from public.settings s where s.key = v_key),
      format('%s is not public, so anon cannot read it and the page is blank for Google', v_key);
  end loop;

  -- The two that are allowed to be empty are allowed to be empty ON PURPOSE: the page falls back to the
  -- brand and to site.contact_email. Asserting they are non-empty would fail honestly today and force
  -- somebody to invent a registered company name to make a test pass.
  assert (select s.value #>> '{}' from public.settings s where s.key = 'legal.privacy_title') <> '',
    'the privacy page has no title';
  assert (select s.value #>> '{}' from public.settings s where s.key = 'legal.privacy_intro') <> '',
    'the privacy page has no introduction';
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.contact_email') <> '',
    'site.contact_email is empty, and nothing else can answer a data request';

  -- Every section must carry both halves. A {title} with no body draws a heading over nothing; a {body}
  -- with no title drops a paragraph into the page with no idea what it answers.
  select s.value into v_sections from public.settings s where s.key = 'legal.privacy_sections';
  assert jsonb_typeof(v_sections) = 'array', 'legal.privacy_sections is not a list';
  assert jsonb_array_length(v_sections) >= 5,
    format('a policy of %s sections does not cover what this system collects', jsonb_array_length(v_sections));

  for v_section in select * from jsonb_array_elements(v_sections) loop
    v_count := v_count + 1;
    assert nullif(btrim(coalesce(v_section ->> 'title', '')), '') is not null,
      format('section %s has no title', v_count);
    assert nullif(btrim(coalesce(v_section ->> 'body', '')), '') is not null,
      format('section «%s» has no body', v_section ->> 'title');
  end loop;

  raise notice 'privacy: % sections, every one titled and written, every row readable by anon', v_count;
end $$;

-- ---------------------------------------------------------------------------
-- The footer link
-- ---------------------------------------------------------------------------

do $$
declare
  v_links jsonb;
  v_link  jsonb;
  v_found boolean := false;
begin
  select s.value into v_links from public.settings s where s.key = 'site.legal_links';
  assert jsonb_typeof(v_links) = 'array', 'site.legal_links is not a list';

  -- site-footer.tsx filters out any entry without BOTH a label and an href, and its comment explains that
  -- it has printed nothing since it was written because no legal route existed. One exists now.
  for v_link in select * from jsonb_array_elements(v_links) loop
    assert nullif(btrim(coalesce(v_link ->> 'label', '')), '') is not null,
      'a legal link has no label, so the footer silently drops it';
    assert nullif(btrim(coalesce(v_link ->> 'href', '')), '') is not null,
      'a legal link has no href, so the footer silently drops it';
    if v_link ->> 'href' = '/privacy' then
      v_found := true;
    end if;
  end loop;

  assert v_found, 'nothing in site.legal_links points at /privacy, so the page exists and nobody can find it';

  raise notice 'footer: the legal links resolve, and one of them is the privacy policy';
end $$;
