-- The offers filter says its own words, and says them to the public.
-- Owner 2026-09-21 (the phone drawing of the offers list); migration 0069.
--
-- Runs against the live database inside a rolled-back transaction.

do $$
declare
  v_key   text;
  v_keys  text[] := array[
    'projects.search_placeholder', 'projects.search_placeholder_fr',
    'projects.filter_all', 'projects.filter_all_fr',
    'projects.filter_empty', 'projects.filter_empty_fr'
  ];
  v_row   public.settings;
begin
  foreach v_key in array v_keys loop
    select * into v_row from public.settings s where s.key = v_key;
    if v_row.key is null then
      raise exception 'the offers filter is missing its text: %', v_key;
    end if;
    -- A page cannot print a setting the public config never loads (the trap of 0040: a key that exists
    -- in the database and is never rendered looks alive from SQL).
    if not v_row.is_public then
      raise exception 'the visitor cannot read %, so the page would fall back to hard-coded Arabic', v_key;
    end if;
    if v_row.value_type <> 'text' then
      raise exception '% must be text, got %', v_key, v_row.value_type;
    end if;
    if v_row.group_key <> 'projects' then
      raise exception '% belongs with the offers settings, got group %', v_key, v_row.group_key;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The Arabic ones carry a sentence; emptying one hides its part of the page rather than breaking it.
-- ---------------------------------------------------------------------------

do $$
declare
  v_all text := app.setting_text('projects.filter_all', '');
begin
  if length(btrim(v_all)) = 0 then
    raise exception 'the «all» chip has no label, so the filter row would open with a nameless chip';
  end if;
  if app.setting_text('projects.filter_empty', '') = app.setting_text('projects.empty_text', '') then
    raise exception 'the filter''s empty line must not repeat projects.empty_text: they answer different questions';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The chips themselves are NOT settings: they are the two columns the offers already carry. This asserts
-- the columns exist with the values the chips are built from, so a rename cannot silently empty the row.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'production_status'
  ) then
    raise exception 'projects.production_status is gone, and the «منتج» chip is built from it';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'plantation_system'
  ) then
    raise exception 'projects.plantation_system is gone, and the «مكثف» chip is built from it';
  end if;
end $$;
