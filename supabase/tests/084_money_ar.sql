-- 0137 · app.money_ar writes an integer number of millimes the way a Tunisian reads it, and stays out of reach
-- of the browser. 067_i18n.sql calls this function to build SMS bodies; nothing there pins down its output, so
-- the formatting contract is pinned down here.
do $$
declare
  v_out text;
begin
  -- A whole-dinar amount carries no fraction: «12 500 د», not «12 500.000 د», which says nothing to a reader.
  select app.money_ar(12500000) into v_out;
  assert v_out = '12 500 د', format('12 500 000 millimes should read «12 500 د», got «%s»', v_out);

  -- Thousands are separated by a space, not a comma: a comma is the decimal mark in French-reading Tunisia.
  assert app.money_ar(1000000) = '1 000 د', format('got «%s»', app.money_ar(1000000));

  -- Under a dinar, and the fraction padded to three, so fifty millimes is «0.050 د» and not «0.50 د».
  assert app.money_ar(500) = '0.500 د', format('500 millimes should read «0.500 د», got «%s»', app.money_ar(500));
  assert app.money_ar(50) = '0.050 د', format('50 millimes should read «0.050 د», got «%s»', app.money_ar(50));
  assert app.money_ar(1000) = '1 د', format('1000 millimes should read «1 د», got «%s»', app.money_ar(1000));

  -- The sign belongs in front of the figure, and the fraction survives it.
  assert app.money_ar(-12500) = '-12.500 د', format('got «%s»', app.money_ar(-12500));

  -- Null is the empty string, never the word «null» in a message to a client.
  assert app.money_ar(null) = '', format('null should format to the empty string, got «%s»', app.money_ar(null));
  assert app.money_ar(0) = '0 د', format('zero should read «0 د», got «%s»', app.money_ar(0));

  -- It composes messages from inside definer functions; a browser has no business calling it.
  assert not has_function_privilege('anon', 'app.money_ar(bigint)', 'execute'),
    'anon can execute app.money_ar';
  assert not has_function_privilege('authenticated', 'app.money_ar(bigint)', 'execute'),
    'authenticated can execute app.money_ar';

  raise notice 'money_ar: whole dinars, padded millimes, sign, null and zero — and out of reach of anon';
end $$;
