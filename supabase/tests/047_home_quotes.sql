-- The quote strip's lines (0074).

do $$
declare
  v jsonb;
begin
  select value into v from public.settings where key = 'site.quotes';

  assert v is not null, 'site.quotes exists';
  assert jsonb_typeof(v) = 'array', 'site.quotes is a list';
  assert jsonb_array_length(v) >= 3, 'the strip has enough lines to be worth sliding';

  -- Every item must carry a sentence; without one the strip would draw an empty card.
  assert not exists (
    select 1 from jsonb_array_elements(v) item
    where coalesce(item->>'ar', '') = ''
  ), 'every quote has its Arabic line';

  assert exists (
    select 1 from public.settings where key = 'site.quotes' and value_type = 'json' and is_public
  ), 'the strip is public copy, read by the anon client with the rest of the page';
end $$;

-- It is copy a visitor reads, so a visitor must be able to read it.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert exists (select 1 from public.settings where key = 'site.quotes'),
    'a visitor reads the quote strip';
end $$;

reset role;
