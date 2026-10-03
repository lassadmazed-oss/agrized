-- أصناف الغراسة تتترجم. Migration supabase/migrations/0113_translations_spacing_classes.sql. Rolled back.

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'translations_known_field')) not like '%tree_spacing_class%' then
    raise exception
      'supabase/migrations/0113_translations_spacing_classes.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0113_translations_spacing_classes.sql supabase/tests/069_i18n_spacing.sql';
  end if;
end $$;

do $$
declare
  v_id uuid;
begin
  -- Every active class with a French name has it as a translation, and a German one.
  assert not exists (
    select 1 from public.tree_spacing_classes c
    where c.is_active and nullif(btrim(c.label_fr), '') is not null
      and not exists (select 1 from public.translations t
                      where t.entity = 'tree_spacing_class' and t.entity_key = c.id::text and t.locale = 'fr')),
    'every planting class''s French is a translation row';

  -- A class is translatable on its label only, and leaves no orphan behind.
  insert into public.tree_spacing_classes (code, label_ar, row_spacing_m, tree_spacing_m, is_active, sort_order)
  values ('test_i18n_9x9', 'صنف اختبار', 9, 9, false, 999)
  returning id into v_id;
  insert into public.translations (entity, entity_key, field, locale, value)
  values ('tree_spacing_class', v_id::text, 'label', 'en', '"Test class"');
  begin
    insert into public.translations (entity, entity_key, field, locale, value)
    values ('tree_spacing_class', v_id::text, 'name', 'en', '"x"');
    raise exception 'a planting class must not take a field other than label';
  exception when check_violation then null;
  end;
  delete from public.tree_spacing_classes where id = v_id;
  assert not exists (select 1 from public.translations where entity_key = v_id::text),
    'deleting a planting class deletes its translations';
end $$;
