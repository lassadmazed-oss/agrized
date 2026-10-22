-- 0145 · the open end of the calculator starts where the steps stop, and the retired card keeps its meaning.
do $$
declare
  v_tail   public.option_items;
  v_old    public.option_items;
  v_top    numeric;
  v_tags   jsonb;
  v_locale text;
  v_code   text;
begin
  select * into v_tail from public.option_items where list_key = 'tree_count' and code = 'trees_50p';
  select * into v_old  from public.option_items where list_key = 'tree_count' and code = 'trees_500p';

  -- 1 · The card is offered, and it is open at the top: a ceiling here would be a fourth kind of card.
  assert v_tail.is_active, 'the open-ended card is not offered';
  assert v_tail.min_number = 50, format('the open end should start at 50, it starts at %s', v_tail.min_number);
  assert v_tail.max_number is null, 'an open end with a ceiling is not an open end';

  -- 2 · No gap between the highest concrete step and the open end. That gap — 50 then «أكثر من 500» — is the
  --     whole reason this migration exists, so it is asserted rather than described.
  select max(o.min_number) into v_top
    from public.option_items o
   where o.list_key = 'tree_count' and o.is_active and o.max_number is not null;
  assert v_top = v_tail.min_number,
    format('the steps stop at %s and the open end begins at %s', v_top, v_tail.min_number);

  -- 3 · The old card is retired, NOT rewritten: every demand that names it still means «500 or more».
  assert not v_old.is_active, 'the 500 card is still offered';
  assert v_old.min_number = 500, 'the retired card''s floor was rewritten, so old demands changed meaning';
  assert v_old.label_ar like '%500%', 'the retired card''s words were rewritten under the demands holding it';

  -- 4 · Every seeded card that is offered has a tagline, and none is left behind for a card nobody shows.
  --     Only the seeded `trees_*` codes: a card the owner adds in the Back Office gets no key of its own and
  --     reads the `custom` line, which is why that key has to survive every rewrite of this object.
  select s.value into v_tags from public.settings s where s.key = 'start.tier_taglines';
  assert v_tags ? 'trees_50p', 'the new card has no tagline';
  assert not (v_tags ? 'trees_500p'), 'the retired card''s tagline is still listed in the Back Office';
  assert v_tags ? 'custom', 'the fallback line for a card added in the Back Office was dropped';
  select o.code into v_code
    from public.option_items o
   where o.list_key = 'tree_count' and o.is_active and o.code like 'trees\_%' and not (v_tags ? o.code)
   limit 1;
  assert v_code is null, format('the card «%s» is offered with no tagline under it', v_code);

  -- 5 · The same in each of the four other languages. A tagline object that still keys the retired card
  --     prints «طموح أكبر» under nothing for every reader who is not reading Arabic.
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    select t.value into v_tags from public.translations t
     where t.entity = 'setting' and t.entity_key = 'start.tier_taglines' and t.field = 'value'
       and t.locale = v_locale;
    assert v_tags is not null, format('the taglines were never translated into %s', v_locale);
    assert v_tags ? 'trees_50p', format('the new card has no tagline in %s', v_locale);
    assert not (v_tags ? 'trees_500p'), format('the retired card still has a tagline in %s', v_locale);

    assert exists (
      select 1 from public.translations t
       where t.entity = 'option_item' and t.entity_key = v_tail.id::text and t.field = 'label'
         and t.locale = v_locale),
      format('the open-ended card has no name in %s', v_locale);
  end loop;

  raise notice 'tree counts: the open end starts at 50, and the 500 card keeps its meaning for the demands that hold it';
end $$;
