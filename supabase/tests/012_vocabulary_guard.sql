-- v2 vocabulary guard (spec v2 §53, §59 · WP-03)
-- Public copy never uses one of the exact §53 phrases stored in legal.forbidden_phrases. The scan is a
-- literal substring match, so a legitimate denial such as the FAQ «هل الإنتاج أو الربح مضمون؟ — لا» passes,
-- and keys named in allowed_keys are skipped by name.

-- Every public text surface, matched against the phrase list as it is stored right now.
create function pg_temp.forbidden_hits() returns text language sql as $$
  with rule as (
    select s.value as v from public.settings s where s.key = 'legal.forbidden_phrases'
  ), phrases as (
    select p.phrase from rule, jsonb_array_elements_text(rule.v->'phrases') p(phrase) where btrim(p.phrase) <> ''
  ), allowed as (
    select array(select jsonb_array_elements_text(rule.v->'allowed_keys')) as keys from rule
  ), hits as (
    select 'settings:' || s.key as source, ph.phrase
    from public.settings s
    cross join allowed a
    join phrases ph on position(ph.phrase in s.value::text) > 0
    where s.is_public and not (s.key = any (a.keys))
    union all
    select 'option_items:' || o.list_key || '/' || coalesce(o.code, o.id::text), ph.phrase
    from public.option_items o
    join phrases ph on position(ph.phrase in concat_ws(' ', o.label_ar, o.label_fr)) > 0
    where o.is_active
    union all
    select 'message_templates:' || t.key, ph.phrase
    from public.message_templates t
    join phrases ph on position(ph.phrase in concat_ws(' ', t.body_ar, t.body_fr)) > 0
    where t.is_active
    union all
    select 'ownership_scenarios:' || sc.code, ph.phrase
    from public.ownership_scenarios sc
    join phrases ph on position(ph.phrase in concat_ws(' ', sc.label_ar, sc.label_fr, sc.description_ar)) > 0
    where sc.is_active
    union all
    select 'project_types:' || pt.code, ph.phrase
    from public.project_types pt
    join phrases ph on position(ph.phrase in concat_ws(' ', pt.label_ar, pt.label_fr, pt.description_ar)) > 0
    where pt.is_active
  )
  select string_agg(h.source || ' «' || h.phrase || '»', '; ' order by h.source) from hits h
$$;

-- 1 · The rule and the new copy keys exist, public and typed ---------------------------------------
do $$
declare
  v_rule  jsonb := (select s.value from public.settings s where s.key = 'legal.forbidden_phrases');
  v_texts text[] := array[
    'site.meta_title', 'site.meta_title_fr', 'site.meta_description', 'site.meta_description_fr',
    'site.cta_primary_label', 'site.cta_primary_label_fr', 'site.cta_secondary_label', 'site.cta_secondary_label_fr',
    'site.cta_offers_label', 'site.cta_offers_label_fr',
    'site.trees_other_card_label', 'site.trees_other_card_label_fr',
    'site.register_meta_title', 'site.register_meta_title_fr',
    'site.register_meta_description', 'site.register_meta_description_fr'
  ];
  v_found bigint;
begin
  assert v_rule is not null, 'legal.forbidden_phrases exists';
  assert (select s.value_type = 'json' and not s.is_public from public.settings s where s.key = 'legal.forbidden_phrases'),
    'the phrase list is a json setting kept off the public site';
  assert jsonb_typeof(v_rule->'phrases') = 'array' and jsonb_typeof(v_rule->'allowed_keys') = 'array',
    'the rule carries a phrases array and an allowed_keys array';
  assert v_rule->'phrases' @> '["أرباح مضمونة", "دخل مضمون", "أفضل استثمار", "مردودية مضمونة"]'::jsonb,
    'every phrase §53 forbids is in the list';

  select count(*) into v_found from public.settings s
  where s.key = any (v_texts) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_texts),
    'every new copy key is a public site text setting: expected ' || cardinality(v_texts) || ', got ' || v_found;

  assert (select s.is_public and s.value_type = 'text' and s.value #>> '{}' in ('start', 'register')
          from public.settings s where s.key = 'site.cta_primary_target'),
    'site.cta_primary_target is a public text holding start or register';
end $$;

-- 2 · No public text uses a forbidden phrase (§53) -------------------------------------------------
do $$
declare
  v_hits text := pg_temp.forbidden_hits();
begin
  assert v_hits is null, 'public copy uses a phrase §53 forbids; reword it in the Back Office: ' || coalesce(v_hits, '');
end $$;

-- 3 · The scan does catch a violation, and a key is skipped only when named ------------------------
do $$
declare
  v_hits text;
begin
  insert into public.settings (key, value, value_type, group_key, label_ar, is_public)
  values ('test.vocabulary_probe', to_jsonb('مشروع فيه أرباح مضمونة'::text), 'text', 'site', 'اختبار', true);

  v_hits := pg_temp.forbidden_hits();
  assert v_hits is not null and position('settings:test.vocabulary_probe' in v_hits) > 0,
    'a public setting with a forbidden phrase is reported, got ' || coalesce(v_hits, 'nothing');

  update public.settings
  set value = jsonb_set(value, '{allowed_keys}', (value->'allowed_keys') || '["test.vocabulary_probe"]'::jsonb)
  where key = 'legal.forbidden_phrases';
  v_hits := pg_temp.forbidden_hits();
  assert v_hits is null or position('settings:test.vocabulary_probe' in v_hits) = 0,
    'a key named in allowed_keys is skipped';

  update public.settings set is_public = false where key = 'test.vocabulary_probe';
  update public.settings
  set value = jsonb_set(value, '{allowed_keys}', (value->'allowed_keys') - 'test.vocabulary_probe')
  where key = 'legal.forbidden_phrases';
  v_hits := pg_temp.forbidden_hits();
  assert v_hits is null or position('settings:test.vocabulary_probe' in v_hits) = 0,
    'a setting kept off the site is not public copy';
end $$;

-- 4 · The seeded investment wording is gone (or the owner had already replaced it) -----------------
do $$
begin
  assert (select s.value from public.settings s where s.key = 'site.home_subheadline')
         is distinct from to_jsonb('كل واحد فينا ينجم يكون فاعل فيه حسب مقدرته.'::text),
    'the hero subheadline carries the second §5 sentence';

  assert (select s.value from public.settings s where s.key = 'site.start_text')
         is distinct from to_jsonb('تنجم تبدا بقدّ ما تنجم. 25 زيتونة كيف 250: الزوز يقرّبوا المشروع للمليون. الفرق في الوقت، موش في المكانة.'::text),
    'the «المليون تبدأ بزيتونة» text is the §7 sentence';

  assert not coalesce((select s.value @> '[{"value": "م²", "label": "المساحة وعدد الزيتونات معطيان مستقلّان"}]'::jsonb
                       from public.settings s where s.key = 'site.facts'), false),
    'the m² fact no longer says area and tree count are unrelated';

  assert not coalesce((select s.value @> '[{"title": "سجّل طلبك", "text": "اختر المنطقة، نوع المشروع، التسبقة والقسط الذي يناسبك. التسجيل مجاني."}]'::jsonb
                       from public.settings s where s.key = 'site.how_it_works'), false),
    'how it works no longer starts from the region';

  assert not coalesce((select s.value @> '[{"ar": "نستثمر في أرضنا"}]'::jsonb
                       from public.settings s where s.key = 'start.values'), false),
    'the /start values no longer say «نستثمر في أرضنا»';

  assert not exists (select 1 from public.option_items o
                     where o.list_key = 'goal' and o.code = 'investment' and o.label_ar = 'استثمار'),
    'the goal option no longer reads «استثمار»';

  assert not exists (select 1 from public.message_templates t
                     where t.key = 'lead.whatsapp_first_contact'
                       and t.body_ar = 'مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no} للاستثمار في الزيتون. وقتاش يناسبك نحكيو؟'),
    'the first WhatsApp message no longer speaks of investing';
end $$;
