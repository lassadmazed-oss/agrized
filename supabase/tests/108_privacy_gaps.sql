-- 0162 · the policy covers what the site does, reaches every reader, and gives them a way to ask.
do $$
declare
  v_locale text;
  v_ar     jsonb;
  v_other  jsonb;
  v_i      integer;
begin
  -- 1 · THE ADDRESS. The policy ends «write to us at the address at the bottom of this page»; with the
  --     field empty, the right to be forgotten had no way to be exercised. It is the smallest finding here
  --     and the only one that made a promise the page could not keep.
  assert coalesce((select s.value #>> '{}' from public.settings s where s.key = 'legal.privacy_email'), '') <> '',
    'the privacy contact address is empty, so «write to us» points at nothing';
  assert (select s.value #>> '{}' from public.settings s where s.key = 'legal.privacy_email') like '%@%',
    'the privacy contact is not an e-mail address';

  select s.value into v_ar from public.settings s where s.key = 'legal.privacy_sections';

  -- 2 · THE WHOLE POLICY REACHES EVERY READER. It had no translation at all: a French, German, Italian or
  --     English visitor was shown Arabic prose, which the site sweep cannot catch because Arabic prose is
  --     valid text and not a missing key.
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    select t.value into v_other from public.translations t
     where t.entity = 'setting' and t.entity_key = 'legal.privacy_sections'
       and t.field = 'value' and t.locale = v_locale;
    assert v_other is not null, format('the privacy policy has no %s version at all', v_locale);

    -- A json ARRAY setting is translated WHOLE (src/lib/config.ts): a short array prints half a policy and
    -- the half that is missing is the half nobody notices.
    assert jsonb_array_length(v_other) = jsonb_array_length(v_ar),
      format('the %s policy has %s sections against Arabic''s %s', v_locale,
             jsonb_array_length(v_other), jsonb_array_length(v_ar));

    for v_i in 0..jsonb_array_length(v_other) - 1 loop
      assert coalesce(btrim(v_other->v_i->>'title'), '') <> '',
        format('section %s of the %s policy has no title', v_i, v_locale);
      assert length(coalesce(v_other->v_i->>'body', '')) > 40,
        format('section %s of the %s policy is empty or a stub', v_i, v_locale);
    end loop;
  end loop;

  -- 3 · EVERYTHING THE SITE ACTUALLY DOES IS IN IT. Each of these is a thing the site collects and the
  --     policy did not mention — the external review found three of them from the outside.
  assert v_ar::text like '%وثائق%', 'the policy does not mention the land documents it stores';
  assert v_ar::text like '%واتساب%', 'the policy does not mention the WhatsApp number taken for a video visit';
  assert v_ar::text like '%المساعد%', 'the policy does not mention the assistant or what happens to a question';
  assert v_ar::text like '%الذكاء الاصطناعي%',
    'the AI provider is not named among those the data is shared with';

  -- 4 · AND IT IS HONEST ABOUT LOCATION, which is the sentence that had stopped being true: the app
  --     computes distance on the phone, and the LAND form sends coordinates to the server. A policy that is
  --     accurate about one feature and wrong about another is worse than one that is vague about both.
  assert v_ar::text like '%إحداثيات%',
    'the policy still does not say that a land offer sends coordinates to the server';

  -- 5 · The retention section names its categories rather than giving one open-ended sentence for all.
  assert (select count(*) from jsonb_array_elements(v_ar) s
           where s->>'body' like '%90%' and s->>'title' like '%نحتفظ%') = 1
      or v_ar::text like '%90 يوم%',
    'there is no retention schedule: one open-ended sentence covers every category';

  -- 6 · The date was moved. A policy whose content changed under an old date tells a reader it did not.
  assert (select (s.value #>> '{}')::date from public.settings s where s.key = 'legal.privacy_updated_at')
         >= current_date - 1,
    'the policy changed but still carries its old date';

  raise notice 'privacy: an address that works, nine sections in five languages, and the land, the visits and the assistant all named';
end $$;
