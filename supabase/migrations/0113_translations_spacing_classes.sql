-- 0113 · أصناف الغراسة تتترجم — THE PLANTING CLASSES JOIN THE TRANSLATIONS.
--
-- Its test is supabase/tests/069_i18n_spacing.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0113_translations_spacing_classes.sql supabase/tests/069_i18n_spacing.sql
--
-- WHY. A planting class («تقليدي»، «مكثّف»…) is a name a visitor reads on the calculator, the home page and every
-- offer page, and 0109 left it out of public.translations: its French lived in tree_spacing_classes.label_fr
-- and German, Italian and English had nothing but that French. It becomes an entity like the list items:
-- field `label`, translations per language, the French column copied in as the French translation so the
-- owner edits it in ONE place (الترجمات) from now on.

alter table public.translations drop constraint translations_known_field;
alter table public.translations add constraint translations_known_field check (
  case entity
    when 'setting'            then field = 'value'
    when 'option_item'        then field = 'label'
    when 'project'            then field in ('name', 'description', 'location_description', 'olive_variety',
                                             'water_note', 'access_note', 'reservation_conditions',
                                             'visit_meeting_point')
    when 'project_type'       then field in ('label', 'description', 'image_alt')
    when 'ownership_scenario' then field in ('label', 'description', 'image_alt')
    when 'governorate'        then field = 'name'
    when 'delegation'         then field = 'name'
    when 'message_template'   then field = 'body'
    when 'project_media'      then field in ('alt', 'caption')
    when 'site_media'         then field = 'alt'
    when 'tree_spacing_class' then field = 'label'
    else false
  end);

create trigger tree_spacing_classes_drop_translations after delete on public.tree_spacing_classes
  for each row execute function app.translations_drop_for('tree_spacing_class', 'id');

-- The owner's French, carried over as the French translation (reviewed: it is the owner's own word).
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'tree_spacing_class', c.id::text, 'label', 'fr', to_jsonb(btrim(c.label_fr)), false
from public.tree_spacing_classes c
where nullif(btrim(c.label_fr), '') is not null
on conflict (entity, entity_key, field, locale) do nothing;

-- First drafts for the other three, by the class's code family (the names repeat across sizes).
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'tree_spacing_class', c.id::text, 'label', d.locale, to_jsonb(d.label), true
from public.tree_spacing_classes c
join (values
  ('trad_wide', 'de', 'Traditionell, weit'), ('trad_wide', 'it', 'Tradizionale ampio'), ('trad_wide', 'en', 'Traditional, wide'),
  ('trad',      'de', 'Traditionell'),       ('trad',      'it', 'Tradizionale'),       ('trad',      'en', 'Traditional'),
  ('semi',      'de', 'Traditionell / halbintensiv'), ('semi', 'it', 'Tradizionale / semi-intensivo'), ('semi', 'en', 'Traditional / semi-intensive'),
  ('int',       'de', 'Intensiv'),           ('int',       'it', 'Intensivo'),          ('int',       'en', 'Intensive'),
  ('super',     'de', 'Superintensiv'),      ('super',     'it', 'Superintensivo'),     ('super',     'en', 'Super-intensive')
) as d (family, locale, label)
  on d.family = case
       when c.code like 'trad_wide%' then 'trad_wide'
       when c.code like 'trad%'      then 'trad'
       when c.code like 'semi%'      then 'semi'
       when c.code like 'super%'     then 'super'
       when c.code like 'int%'       then 'int'
     end
on conflict (entity, entity_key, field, locale) do nothing;
