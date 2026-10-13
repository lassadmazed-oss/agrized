-- 0141 · the calculator offers 1, 5, 10, 15, 20, 25, 50 — and the three big cards are retired, not deleted.
do $$
declare
  v_codes text[];
  v_code  text;
  v_id    uuid;
  v_loc   text;
  v_tags  jsonb;
begin
  -- 1 · What a visitor is offered, in the order the cards are drawn.
  select array_agg(o.code order by o.sort_order) into v_codes
    from public.option_items o
   where o.list_key = 'tree_count' and o.is_active;

  foreach v_code in array array['trees_5', 'trees_10', 'trees_15', 'trees_20'] loop
    assert v_code = any (v_codes), format('%s is not offered', v_code);
  end loop;
  foreach v_code in array array['trees_100', 'trees_250', 'trees_500'] loop
    assert not (v_code = any (v_codes)), format('%s is still offered', v_code);
  end loop;

  -- 2 · Retired, NOT deleted: public.interest_requests.tree_count_option_id still points at these rows, and
  --     every demand ever sent with «100 زيتونة» names one of them. Losing the row loses the figure.
  foreach v_code in array array['trees_100', 'trees_250', 'trees_500'] loop
    assert exists (select 1 from public.option_items o where o.list_key = 'tree_count' and o.code = v_code),
      format('%s was deleted — old demands that name it can no longer be read', v_code);
  end loop;

  -- 3 · They climb. A list that offers 20 after 25 is a list somebody mis-sorted.
  assert v_codes = array['tree_count_mu45kida', 'trees_5', 'trees_10', 'trees_15', 'trees_20', 'trees_25', 'trees_50', 'trees_500p', 'trees_any']
      or (select array_agg(o.min_number order by o.sort_order) from public.option_items o
           where o.list_key = 'tree_count' and o.is_active and o.min_number is not null)
         = (select array_agg(x order by x) from unnest((select array_agg(o.min_number)
             from public.option_items o where o.list_key = 'tree_count' and o.is_active and o.min_number is not null)) x),
    format('the counts are not in climbing order: %s', v_codes::text);

  -- 4 · Each new card carries a real number, not a range.
  foreach v_code in array array['trees_5', 'trees_10', 'trees_15', 'trees_20'] loop
    assert (select o.min_number = o.max_number and o.min_number > 0
              from public.option_items o where o.list_key = 'tree_count' and o.code = v_code),
      format('%s does not name one exact count', v_code);
  end loop;

  -- 5 · And it can be read in every language: the label, and the line under it.
  foreach v_code in array array['trees_5', 'trees_10', 'trees_15', 'trees_20'] loop
    select o.id into v_id from public.option_items o where o.list_key = 'tree_count' and o.code = v_code;
    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      assert exists (select 1 from public.translations t
                      where t.entity = 'option_item' and t.entity_key = v_id::text
                        and t.field = 'label' and t.locale = v_loc),
        format('%s has no %s label', v_code, v_loc);
    end loop;

    assert (select s.value -> v_code from public.settings s where s.key = 'start.tier_taglines') is not null,
      format('%s has no Arabic tagline', v_code);
    foreach v_loc in array array['fr', 'de', 'it', 'en'] loop
      select t.value into v_tags from public.translations t
       where t.entity = 'setting' and t.entity_key = 'start.tier_taglines' and t.field = 'value' and t.locale = v_loc;
      assert v_tags -> v_code is not null, format('%s has no %s tagline', v_code, v_loc);
    end loop;
  end loop;

  -- 6 · And the retired cards leave no tagline behind for the texts screen to list.
  foreach v_code in array array['trees_100', 'trees_250', 'trees_500'] loop
    assert (select s.value -> v_code from public.settings s where s.key = 'start.tier_taglines') is null,
      format('%s still has a tagline for a card nobody shows', v_code);
  end loop;

  raise notice 'tree counts: 1·5·10·15·20·25·50 offered, three retired but readable, five languages';
end $$;
