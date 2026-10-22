-- 0148 · both sentences exist, in every language, and the figures that decide between them really can be
-- absent — which is the half the screen cannot be trusted to prove about itself.
do $$
declare
  v_locale text;
  v_naked  integer;
begin
  -- 1 · The two notes, and the old one left alone. A card chooses between them, so losing either leaves a
  --     request explained by nothing.
  assert exists (select 1 from public.settings s where s.key = 'ui.zitounti.request_prices_note'),
    'the note for a request that DOES carry prices is gone';
  assert exists (select 1 from public.settings s where s.key = 'ui.zitounti.request_no_prices'),
    'the note for a request that carries none was not added';
  assert (select s.value from public.settings s where s.key = 'ui.zitounti.request_no_prices')
         <> (select s.value from public.settings s where s.key = 'ui.zitounti.request_prices_note'),
    'the two notes say the same thing, so the card still explains prices it did not show';

  -- 2 · In the four other languages. A missing translation falls back to Arabic, which on the French site
  --     is a sentence the reader cannot read where a price should have been.
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    assert exists (
      select 1 from public.translations t
       where t.entity = 'setting' and t.entity_key = 'ui.zitounti.request_no_prices'
         and t.field = 'value' and t.locale = v_locale),
      format('the new note was never translated into %s', v_locale);
  end loop;

  -- 3 · THE CASE IS REAL, not hypothetical: requests with no figure at all exist in this database, which is
  --     what the owner was looking at. If this ever stops being true the branch is dead code and should go.
  -- The five columns app.zitounti_requests publishes as the card's five rows, named as the table holds
  -- them: the card prints a row only when its column is not null, so all five null is an empty card.
  select count(*) into v_naked
  from public.interest_requests r
  where r.offer_trees is null
    and r.offer_price_per_tree_millimes is null
    and r.offer_total_price_millimes is null
    and r.offer_annual_fee_per_tree_millimes is null
    and r.offer_annual_fee_total_millimes is null;
  if v_naked = 0 then
    raise notice 'no request without figures in this database; the branch is untested here';
  end if;

  raise notice 'request notes: a card with prices explains them, a card without says we will call';
end $$;
