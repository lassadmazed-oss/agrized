-- Test for the goal line: the counter reports, it no longer announces a target.

-- 1 · Nothing public shows the visitor a goal figure -------------------------------------------------
do $$
begin
  assert (select coalesce(btrim(s.value #>> '{}'), '') = '' from public.settings s where s.key = 'million.goal_label'),
    'the goal line is empty, so the section hides it';
  assert (select coalesce(btrim(s.value #>> '{}'), '') = '' from public.settings s where s.key = 'million.goal_label_fr'),
    'the French goal line is empty too';

  -- {goal} is the only way a public text can print the figure, so no public copy may carry it.
  assert not exists (
    select 1 from public.settings s where s.is_public and s.value::text like '%{goal}%'
  ), 'no public text prints the target figure any more';
end $$;

-- 2 · The bar still says what actually came in -------------------------------------------------------
do $$
declare
  v_caption text := (select value #>> '{}' from public.settings where key = 'million.bar_caption');
begin
  assert v_caption like '%{count}%', 'the caption still fills the real count, got ' || coalesce(v_caption, 'null');
  assert v_caption not like '%{goal}%', 'the caption no longer measures against the target';
  assert (select value #>> '{}' from public.settings where key = 'million.bar_caption_fr') like '%{count}%',
    'the French caption still fills the real count';
end $$;

-- 3 · The counter keeps everything it needs to work --------------------------------------------------
do $$
declare
  v_keys text[] := array['million.goal_label', 'million.goal_label_fr', 'million.bar_caption', 'million.bar_caption_fr',
                         'million.bar_empty', 'million.bar_empty_fr', 'million.share_below', 'million.share_below_fr'];
  v_found bigint;
begin
  -- 011 asserts these exist as public site texts: emptied, never deleted.
  select count(*) into v_found from public.settings s
  where s.key = any (v_keys) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_keys), 'every counter text row is still there, got ' || v_found;

  -- MIL-02: the bar's denominator is still a setting, and still a number.
  assert (select value_type = 'integer' and (value #>> '{}')::bigint > 0 from public.settings where key = 'million.goal'),
    'the bar still has a denominator to compute its share with';

  -- The Back Office no longer calls that row a project-wide goal.
  assert (select label_ar not like '%المليون%' from public.settings where key = 'million.goal'),
    'the setting is labelled as the bar reference, not as the million project goal';
end $$;

-- 4 · The people line the section now leads with is untouched ----------------------------------------
do $$
begin
  assert (select value #>> '{}' like '%{people}%' from public.settings where key = 'million.people_lead'),
    'the people line still leads the section';
end $$;

-- 5 · A visitor reads the counter copy, and reads no target ------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'million.goal_label%') = 2,
    'the goal line rows are still readable, just empty';
  assert not exists (
    select 1 from public.settings where key like 'million.%' and value::text like '%{goal}%'
  ), 'a visitor is shown no target figure';
end $$;

reset role;
