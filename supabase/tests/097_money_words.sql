-- 0150 · the switch exists, reaches the site, and is a boolean the Back Office can actually turn.
do $$
declare
  v_row public.settings;
begin
  select * into v_row from public.settings s where s.key = 'money.show_words';
  assert v_row.key is not null, 'money.show_words is missing, so the words cannot be turned off without a deploy';

  -- 1 · Published: the site reads only is_public settings, so a private one is a switch wired to nothing.
  assert v_row.is_public, 'money.show_words is not published to the site';

  -- 2 · A boolean, declared as one. value_type is what the Back Office draws the control from: a checkbox
  --     for a boolean, a text box for anything else — and a text box holding «true» is a switch that breaks
  --     the first time somebody types «yes» in it.
  assert v_row.value_type = 'boolean',
    format('money.show_words is declared %s, so the Back Office will not draw it as a switch', v_row.value_type);
  assert jsonb_typeof(v_row.value) = 'boolean',
    format('money.show_words holds %s and not a boolean', jsonb_typeof(v_row.value));

  -- 3 · On by default: the owner asked for the words, and a switch that ships off ships the old behaviour.
  assert (v_row.value)::boolean, 'money.show_words shipped switched off';

  -- 4 · It is described in the Back Office. A settings row with no label is a key nobody dares touch.
  assert coalesce(v_row.label_ar, '') <> '', 'money.show_words has no name in the Back Office';
  assert coalesce(v_row.description_ar, '') <> '', 'money.show_words has no explanation in the Back Office';

  -- 5 · NOT TRANSLATED, and that is deliberate — the words are Arabic only (src/lib/money-words.ts says at
  --     length why), so a per-language value would promise something no language but Arabic can deliver.
  assert not exists (
    select 1 from public.translations t
     where t.entity = 'setting' and t.entity_key = 'money.show_words'),
    'money.show_words was given per-language values, but the words it switches exist only in Arabic';

  raise notice 'money words: one published boolean, on by default, described, and not pretending to be translatable';
end $$;
