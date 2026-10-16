-- 0142 · the push screen's words.

do $$
declare
  v_keys text[] := array['ui.push.title','ui.push.text','ui.push.enable','ui.push.on','ui.push.denied','ui.push.failed'];
  v_key  text;
begin
  foreach v_key in array v_keys loop
    assert exists (
      select 1 from public.settings s
      where s.key = v_key and s.value_type = 'text' and s.group_key = 'ui' and s.is_public
    ), format('%s is public ui copy the app can read', v_key);

    assert coalesce((select s.value #>> '{}' from public.settings s where s.key = v_key), '') <> '',
      format('%s says something', v_key);

    -- The app prints a key's own name when the row is missing, and the four other languages are what the
    -- owner reviews in the Back Office. A key seeded in Arabic alone shows Arabic to a French reader.
    assert (select count(*) from public.translations t
             where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value') = 4,
      format('%s carries the four translations', v_key);
  end loop;
end $$;

-- The sentence that asks for permission is the one Apple and the person both judge. It must say what the
-- notifications are about, and it must not promise something the templates do not send.
do $$
declare v_text text := (select s.value #>> '{}' from public.settings s where s.key = 'ui.push.text');
begin
  assert char_length(v_text) between 40 and 300,
    'the explanation is a sentence, not a word and not a page';

  -- Every push template in 0138 is transactional. If marketing is ever added, this assertion is the place
  -- the promise and the practice are reconciled — deliberately, rather than by someone noticing later.
  assert not exists (
    select 1 from public.message_templates
     where channel = 'push' and is_active
       and (key like 'promo%' or key like 'marketing%' or key like '%offer_push%')),
    'nothing advertising is sent by push, which is what ui.push.text promises';
end $$;
