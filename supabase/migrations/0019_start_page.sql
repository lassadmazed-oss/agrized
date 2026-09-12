-- 0019 · The /start page — «قدّاش زيتونة تحب تبدا بيهم؟» gets its own page, and a typed number
--
-- MIL-01: the number of olive trees is the entry point. Next to the cards the visitor can type any
--         number; it is stored like a chosen option and counted through tree_count_min, so the
--         public counter keeps showing real rows only.
-- MIL-02 / PRN-02: every text on the page, the taglines under the cards, the value lines and the
--         limits of the typed number live in settings and are edited from the Back Office.
-- LEAD-01 / LEAD-02: cards, scenarios and capacities come from the Back Office lists and are
--         snapshotted on the request; a typed number is snapshotted the same way (code 'custom').
-- PARC-02: a tree count is never derived from a surface, and no price is ever derived from a count.
-- Owner decision of 2026-09-12: /start is bilingual — Arabic first, French beneath each text. The
--         *_fr keys exist for that page only; the rest of the site stays Arabic.

-- ---------------------------------------------------------------------------
-- Copy of the /start page (MIL-02, PRN-02)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.trees_question_fr', to_jsonb('Combien d''oliviers pour commencer ?'::text),
   'text', 'site', 'سؤال عدد الزيتونات (فرنسي)', 'السطر الفرنسي تحت السؤال العربي في صفحة /start.', true, 120),
  ('site.trees_subtitle', to_jsonb('اختر العدد اللي يناسبك، وكل زيتونة تقرّبنا من المليون.'::text),
   'text', 'site', 'نص تحت سؤال عدد الزيتونات', 'يظهر تحت السؤال في أعلى صفحة /start.', true, 121),
  ('site.trees_subtitle_fr', to_jsonb('Choisissez le nombre qui vous convient. Chaque olivier nous rapproche du million.'::text),
   'text', 'site', 'نص تحت سؤال عدد الزيتونات (فرنسي)', 'السطر الفرنسي تحت النص العربي في صفحة /start.', true, 122),
  ('site.style_question_fr', to_jsonb('Comment voulez-vous votre projet ?'::text),
   'text', 'site', 'سؤال نوع المشروع (فرنسي)', 'السطر الفرنسي تحت السؤال العربي في صفحة /start.', true, 123),
  ('site.trees_other_link', to_jsonb('عندك عدد آخر في بالك؟ اكتبو بنفسك.'::text),
   'text', 'site', 'رابط «عندك عدد آخر؟»', 'يظهر تحت بطاقات الأعداد في صفحة /start ويفتح خانة العدد المخصّص.', true, 124),

  ('start.capacity_title', to_jsonb('قدرتك المالية'::text),
   'text', 'site', 'عنوان قسم القدرة المالية', 'يظهر فوق خيارات التسبقة والقسط في صفحة /start.', true, 125),
  ('start.capacity_title_fr', to_jsonb('Votre capacité financière'::text),
   'text', 'site', 'عنوان قسم القدرة المالية (فرنسي)', 'السطر الفرنسي تحت العنوان العربي في صفحة /start.', true, 126),
  ('start.capacity_hint', to_jsonb('اختر التسبقة والقسط اللي يناسبوك. هذي قدرتك، موش سعر مشروع.'::text),
   'text', 'site', 'ملاحظة قسم القدرة المالية', 'تظهر تحت عنوان القدرة المالية في صفحة /start.', true, 127),
  ('start.capacity_hint_fr', to_jsonb('Choisissez l''apport et la mensualité qui vous conviennent. C''est votre capacité, pas le prix d''un projet.'::text),
   'text', 'site', 'ملاحظة قسم القدرة المالية (فرنسي)', 'السطر الفرنسي تحت الملاحظة العربية في صفحة /start.', true, 128),

  ('start.summary_title', to_jsonb('مشروعك المبدئي'::text),
   'text', 'site', 'عنوان بطاقة الملخّص', 'عنوان بطاقة «مشروعك المبدئي» في صفحة /start.', true, 129),
  ('start.summary_title_fr', to_jsonb('Votre projet initial'::text),
   'text', 'site', 'عنوان بطاقة الملخّص (فرنسي)', 'السطر الفرنسي تحت عنوان بطاقة الملخّص في صفحة /start.', true, 130),
  ('start.row_trees', to_jsonb('عدد الزيتونات'::text),
   'text', 'site', 'صف عدد الزيتونات في الملخّص', 'اسم الصف في بطاقة الملخّص في صفحة /start.', true, 131),
  ('start.row_trees_fr', to_jsonb('Nombre d''oliviers'::text),
   'text', 'site', 'صف عدد الزيتونات في الملخّص (فرنسي)', 'السطر الفرنسي تحت اسم الصف في صفحة /start.', true, 132),
  ('start.row_type', to_jsonb('نوع المشروع'::text),
   'text', 'site', 'صف نوع المشروع في الملخّص', 'اسم الصف في بطاقة الملخّص في صفحة /start.', true, 133),
  ('start.row_type_fr', to_jsonb('Type de projet'::text),
   'text', 'site', 'صف نوع المشروع في الملخّص (فرنسي)', 'السطر الفرنسي تحت اسم الصف في صفحة /start.', true, 134),
  ('start.row_down', to_jsonb('التسبقة'::text),
   'text', 'site', 'صف التسبقة في الملخّص', 'اسم الصف في بطاقة الملخّص في صفحة /start.', true, 135),
  ('start.row_down_fr', to_jsonb('Apport initial'::text),
   'text', 'site', 'صف التسبقة في الملخّص (فرنسي)', 'السطر الفرنسي تحت اسم الصف في صفحة /start.', true, 136),
  ('start.row_installment', to_jsonb('القسط الشهري'::text),
   'text', 'site', 'صف القسط الشهري في الملخّص', 'اسم الصف في بطاقة الملخّص في صفحة /start.', true, 137),
  ('start.row_installment_fr', to_jsonb('Mensualité'::text),
   'text', 'site', 'صف القسط الشهري في الملخّص (فرنسي)', 'السطر الفرنسي تحت اسم الصف في صفحة /start.', true, 138),

  ('start.continue', to_jsonb('متابعة'::text),
   'text', 'site', 'نص زر المتابعة', 'الزر الذي ينقل الزائر من صفحة /start إلى استمارة التسجيل.', true, 139),
  ('start.continue_fr', to_jsonb('Continuer'::text),
   'text', 'site', 'نص زر المتابعة (فرنسي)', 'السطر الفرنسي تحت نص الزر في صفحة /start.', true, 140),
  ('start.continue_hint', to_jsonb('اختر عدد الزيتونات باش تكمّل. الباقي اختياري.'::text),
   'text', 'site', 'ملاحظة تحت زر المتابعة', 'تظهر تحت الزر ما دام عدد الزيتونات لم يُختر بعد في صفحة /start.', true, 141),
  ('start.continue_hint_fr', to_jsonb('Choisissez un nombre d''oliviers pour continuer. Le reste est facultatif.'::text),
   'text', 'site', 'ملاحظة تحت زر المتابعة (فرنسي)', 'السطر الفرنسي تحت الملاحظة العربية في صفحة /start.', true, 142),
  ('start.secure_note', to_jsonb('معلوماتك مؤمّنة وآمنة.'::text),
   'text', 'site', 'ملاحظة الأمان', 'تظهر تحت زر المتابعة في صفحة /start.', true, 143),
  ('start.secure_note_fr', to_jsonb('Vos informations sont sécurisées.'::text),
   'text', 'site', 'ملاحظة الأمان (فرنسي)', 'السطر الفرنسي تحت ملاحظة الأمان في صفحة /start.', true, 144),

  ('start.home_label', to_jsonb('الرئيسية'::text),
   'text', 'site', 'اسم الرئيسية في مسار التنقّل', 'أول عنصر في مسار التنقّل أعلى صفحة /start.', true, 145),
  ('start.home_label_fr', to_jsonb('Accueil'::text),
   'text', 'site', 'اسم الرئيسية في مسار التنقّل (فرنسي)', 'السطر الفرنسي تحت اسم الرئيسية في صفحة /start.', true, 146),
  ('start.breadcrumb', to_jsonb('اختيار عدد الزيتونات'::text),
   'text', 'site', 'اسم الصفحة في مسار التنقّل', 'آخر عنصر في مسار التنقّل أعلى صفحة /start.', true, 147),
  ('start.breadcrumb_fr', to_jsonb('Choisir par nombre d''arbres'::text),
   'text', 'site', 'اسم الصفحة في مسار التنقّل (فرنسي)', 'السطر الفرنسي تحت اسم الصفحة في صفحة /start.', true, 148),

  ('start.custom_label', to_jsonb('عدد مخصّص'::text),
   'text', 'site', 'عنوان خانة العدد المخصّص', 'يظهر فوق خانة كتابة العدد في صفحة /start.', true, 149),
  ('start.custom_label_fr', to_jsonb('Nombre personnalisé'::text),
   'text', 'site', 'عنوان خانة العدد المخصّص (فرنسي)', 'السطر الفرنسي تحت عنوان الخانة في صفحة /start.', true, 150),
  ('start.custom_placeholder', to_jsonb('أدخل العدد'::text),
   'text', 'site', 'نص خانة العدد المخصّص قبل الكتابة', 'يظهر داخل الخانة الفارغة في صفحة /start.', true, 151),
  ('start.custom_placeholder_fr', to_jsonb('Saisir le nombre'::text),
   'text', 'site', 'نص خانة العدد المخصّص قبل الكتابة (فرنسي)', 'السطر الفرنسي داخل الخانة الفارغة في صفحة /start.', true, 152),
  ('start.custom_hint', to_jsonb('اكتب عدداً بين {min} و{max}.'::text),
   'text', 'site', 'ملاحظة حدود العدد المخصّص', 'تظهر تحت خانة العدد في صفحة /start. {min} و{max} يُستبدلان بالحدّين من الإعدادات.', true, 153),
  ('start.custom_hint_fr', to_jsonb('Saisissez un nombre entre {min} et {max}.'::text),
   'text', 'site', 'ملاحظة حدود العدد المخصّص (فرنسي)', 'السطر الفرنسي تحت الملاحظة العربية في صفحة /start. {min} و{max} يُستبدلان بالحدّين.', true, 154),

  ('start.tier_taglines', $json${
    "trees_25":   {"ar": "بداية مثالية",       "fr": "Un excellent départ"},
    "trees_50":   {"ar": "خطوة واثقة",         "fr": "Un choix judicieux"},
    "trees_100":  {"ar": "مشاركة متوازنة",     "fr": "Une participation équilibrée"},
    "trees_250":  {"ar": "مساهمة كبيرة",       "fr": "Une belle contribution"},
    "trees_500":  {"ar": "رؤية أوسع",          "fr": "Une vision plus grande"},
    "trees_500p": {"ar": "طموح أكبر",          "fr": "Une ambition plus grande"},
    "trees_any":  {"ar": "نقترحولك الأنسب",    "fr": "Nous vous proposons le plus adapté"},
    "custom":     {"ar": "على قدّ طموحك",      "fr": "Selon vos ambitions"}
  }$json$::jsonb, 'json', 'site', 'الشعارات القصيرة تحت بطاقات الأعداد',
   'كائن مفتاحه رمز الخيار في قائمة tree_count («custom» للعدد المخصّص) وقيمته {ar, fr}. تظهر تحت كل بطاقة في صفحة /start.', true, 155),

  ('start.values', $json$[
    {"icon": "people", "ar": "مليون زيتونة… مشروعنا المشترك", "fr": "Le projet du million d'oliviers… notre engagement commun"},
    {"icon": "leaf",   "ar": "كل اختيار يساهم في تحقيق الهدف", "fr": "Chaque choix contribue à atteindre l'objectif"},
    {"icon": "hand",   "ar": "نستثمر في أرضنا",               "fr": "Nous investissons dans notre terre"},
    {"icon": "chart",  "ar": "نبني مستقبلاً أكثر خضرة",         "fr": "Nous construisons un avenir plus vert"}
  ]$json$::jsonb, 'json', 'site', 'قيم المشروع في صفحة /start',
   'قائمة {icon, ar, fr} تظهر بجانب بطاقة الملخّص في صفحة /start. الأيقونات المتاحة: people, leaf, hand, chart.', true, 156),

  ('start.trees_unit', to_jsonb('زيتونة'::text),
   'text', 'site', 'وحدة عدد الزيتونات', 'تُكتب بعد العدد المخصّص في ملخّص صفحة /start وفي تسمية الطلب المسجّل (مثال: 37 زيتونة).', true, 159),
  ('start.trees_unit_fr', to_jsonb('oliviers'::text),
   'text', 'site', 'وحدة عدد الزيتونات (فرنسي)', 'السطر الفرنسي بعد العدد المخصّص في ملخّص صفحة /start.', true, 160),
  ('start.per_month', to_jsonb('شهرياً'::text),
   'text', 'site', 'كلمة «شهرياً» تحت الأقساط', 'تظهر تحت كل قيمة قسط شهري في صفحة /start.', true, 161),
  ('start.per_month_fr', to_jsonb('par mois'::text),
   'text', 'site', 'كلمة «شهرياً» (فرنسي)', 'السطر الفرنسي تحت كل قيمة قسط شهري في صفحة /start.', true, 162),

  ('million.custom_trees_min', to_jsonb(1), 'integer', 'site', 'أقل عدد مخصّص للزيتونات',
   'الحدّ الأدنى للعدد الحرّ الذي يكتبه الزائر في صفحة /start وفي الاستمارة. أقل منه يُرفض.', true, 157),
  -- Each request adds its number to the public counter, so a low ceiling limits what one spammer can inflate.
  ('million.custom_trees_max', to_jsonb(5000), 'integer', 'site', 'أكبر عدد مخصّص للزيتونات',
   'الحدّ الأقصى للعدد الحرّ الذي يكتبه الزائر في صفحة /start وفي الاستمارة. أكثر منه يُرفض. كل مطلب يزيد رقمه في العدّاد العمومي، لذلك يُنصح بسقف معقول.', true, 158)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Photo slot of the page (MED-01)
-- ---------------------------------------------------------------------------

insert into public.site_media (slot, label_ar, description_ar, aspect, group_key, sort_order) values
  ('start.side', 'صورة صفحة اختيار العدد', 'صورة زيتون أو منظر ريفي تظهر فوق بطاقة «مشروعك المبدئي» في صفحة /start.', '3/4', 'start', 10)
on conflict (slot) do nothing;

-- ---------------------------------------------------------------------------
-- Intake: a typed number is accepted next to the option, never together with it
-- ---------------------------------------------------------------------------

comment on column public.interest_requests.tree_count_code is
  '''custom'' marks a number the visitor typed, snapshotted like every option (LEAD-02) and counted through tree_count_min (MIL-01).';

create or replace function public.submit_interest_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name         text := btrim(coalesce(p->>'full_name', ''));
  v_phone        text := p->>'phone_e164';
  v_whatsapp     text := nullif(p->>'whatsapp_e164', '');
  v_email        text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov          smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del          integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_anywhere     boolean := coalesce((p->>'invest_anywhere')::boolean, false);
  v_unsure       boolean := coalesce((p->>'project_type_unsure')::boolean, false);
  v_consent      text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_invest_govs  smallint[];
  v_types        uuid[];
  v_scenarios    uuid[];
  v_scn_labels   text[] := '{}';
  v_plantation   text[] := '{}';
  v_production   text[] := '{}';
  v_any_scenario boolean := false;
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_inst         public.option_items;
  v_time         public.option_items;
  v_area         public.option_items;
  v_trees        public.option_items;
  v_custom       integer;
  v_priority     public.option_items;
  v_status_id    uuid;
  v_person_id    uuid;
  v_inserted     boolean;
  v_assignee     uuid;
  v_year         text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no   text;
  v_request_id   uuid;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  -- Residence: governorate required, delegation optional but checked when given.
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;

  -- Where to invest
  select coalesce(array_agg(distinct x::smallint), '{}') into v_invest_govs
  from jsonb_array_elements_text(coalesce(p->'invest_governorate_ids', '[]'::jsonb)) x;
  if v_anywhere then
    v_invest_govs := '{}';
  elsif cardinality(v_invest_govs) = 0 then
    raise exception 'invest_location_required' using errcode = 'P0001';
  elsif (select count(*) from public.governorates g where g.id = any (v_invest_govs) and g.is_active)
        <> cardinality(v_invest_govs) then
    raise exception 'invalid_invest_governorate' using errcode = 'P0001';
  end if;

  -- What the citizen wants to own (clause 25.3). Scenarios decide the project types.
  select coalesce(array_agg(distinct x::uuid), '{}') into v_scenarios
  from jsonb_array_elements_text(coalesce(p->'scenario_ids', '[]'::jsonb)) x;

  if cardinality(v_scenarios) > 0 then
    if (select count(*) from public.ownership_scenarios s where s.id = any (v_scenarios) and s.is_active)
       <> cardinality(v_scenarios) then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end if;
    if not app.setting_bool('lead.project_types_multi', true) and cardinality(v_scenarios) > 1 then
      raise exception 'single_scenario_only' using errcode = 'P0001';
    end if;

    select
      coalesce(array_agg(distinct s.project_type_id) filter (where s.project_type_id is not null), '{}'),
      coalesce(array_agg(s.label_ar order by s.sort_order), '{}'),
      coalesce(array_agg(distinct s.plantation_system) filter (where s.plantation_system is not null), '{}'),
      coalesce(array_agg(distinct s.production_status) filter (where s.production_status is not null), '{}'),
      bool_or(s.is_any)
    into v_types, v_scn_labels, v_plantation, v_production, v_any_scenario
    from public.ownership_scenarios s
    where s.id = any (v_scenarios);

    if v_any_scenario then
      v_types := '{}';
    end if;
    v_unsure := v_any_scenario or cardinality(v_types) = 0;
  else
    -- Fallback for callers that still send project types directly.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_types
    from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
    if v_unsure then
      v_types := '{}';
    elsif cardinality(v_types) = 0 then
      raise exception 'scenario_required' using errcode = 'P0001';
    elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
      raise exception 'single_project_type_only' using errcode = 'P0001';
    elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
          <> cardinality(v_types) then
      raise exception 'invalid_project_type' using errcode = 'P0001';
    end if;
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  v_down := app.active_option('down_payment', p->>'down_payment_option_id');
  if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
  if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'desired_area_option_id', '') is not null then
    v_area := app.active_option('desired_area', p->>'desired_area_option_id');
    if v_area.id is null then raise exception 'invalid_desired_area' using errcode = 'P0001'; end if;
  end if;
  -- MIL-01 · how many olive trees the citizen wants to start with
  if nullif(p->>'tree_count_option_id', '') is not null then
    v_trees := app.active_option('tree_count', p->>'tree_count_option_id');
    if v_trees.id is null then raise exception 'invalid_tree_choice' using errcode = 'P0001'; end if;
  end if;
  -- ... or a number typed on /start. The database stays strict: Western digits only, the page converts.
  begin
    v_custom := nullif(btrim(coalesce(p->>'tree_count_custom', '')), '')::integer;
  exception when others then
    raise exception 'invalid_tree_custom' using errcode = 'P0001';
  end;
  if v_custom is not null then
    if nullif(p->>'tree_count_option_id', '') is not null then
      raise exception 'invalid_tree_choice' using errcode = 'P0001';
    end if;
    if v_custom < app.setting_int('million.custom_trees_min', 1)
       or v_custom > app.setting_int('million.custom_trees_max', 5000) then
      raise exception 'invalid_tree_custom' using errcode = 'P0001';
    end if;
  end if;
  if nullif(p->>'priority_option_id', '') is not null then
    v_priority := app.active_option('priority', p->>'priority_option_id');
    if v_priority.id is null then raise exception 'invalid_priority' using errcode = 'P0001'; end if;
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;

  -- Throttling (LEAD-06)
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- One person per phone (LEAD-04). Existing person data is never overwritten from the public form.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now())
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12)
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    scenario_ids, scenario_labels, plantation_systems, production_statuses,
    tree_count_option_id, tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    desired_area_option_id, desired_area_label_ar, desired_area_min_m2, desired_area_max_m2,
    priority_option_id, priority_code, priority_label_ar,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_scenarios, v_scn_labels, v_plantation, v_production,
    case when v_custom is null then v_trees.id end,
    case when v_custom is null then v_trees.code else 'custom' end,
    case when v_custom is null then v_trees.label_ar else v_custom::text || ' ' || app.setting_text('start.trees_unit', 'زيتونة') end,
    case when v_custom is null then v_trees.min_number::integer else v_custom end,
    case when v_custom is null then v_trees.max_number::integer else v_custom end,
    v_area.id, v_area.label_ar, v_area.min_number, v_area.max_number,
    v_priority.id, v_priority.code, v_priority.label_ar,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $$;
