-- Counter split and the public statistics module (spec v2 §6, §54 · WP-01)
--
-- §6: requested, reserved, contracted and planted olive trees are separate figures and are never mixed.
--     They come from real rows only (MIL-01): demands for the first, parcels for the other three.
-- §54 / FLAG-01: the public counter is a module the Back Office publishes, keeps internal or hides.
-- Parcel statuses are compared as text so this body still compiles before 'owned' exists (0021).

-- ---------------------------------------------------------------------------
-- The public counter, split by stage
-- ---------------------------------------------------------------------------

create or replace function public.million_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    -- A direct database session carries no JWT (migrations, tests, scripts) and always reads.
    when app.module_open('public_statistics')
      or coalesce(current_setting('request.jwt.claims', true), '') = ''
    then (
      select jsonb_build_object(
        'goal', app.setting_int('million.goal', 1000000),
        -- Lower bound of every stated choice, so the figure is never larger than what people asked for.
        'trees_requested', coalesce((
          select sum(r.tree_count_min) from public.interest_requests r where not r.is_duplicate
        ), 0),
        'participants', (
          select count(distinct r.person_id) from public.interest_requests r
        ),
        'requests', (select count(*) from public.interest_requests r where not r.is_duplicate),
        -- Land being studied before anything is offered: draft, preparing and internal projects.
        'projects_under_study', (
          select count(*) from public.projects pj
          where pj.status in ('draft', 'preparing', 'internal')
        ),
        'trees_reserved', t.reserved,
        -- 'contracting' (contract in progress) counts here by agreement; the tile label says so in settings.
        'trees_contracted', t.contracted,
        'trees_planted', t.planted
      )
      from (
        select
          coalesce(sum(pa.olive_tree_count) filter (where pa.status::text = 'reserved'), 0) as reserved,
          coalesce(sum(pa.olive_tree_count) filter (where pa.status::text in ('contracting', 'sold', 'owned')), 0) as contracted,
          coalesce(sum(pa.olive_tree_count) filter (where pa.status::text <> 'withdrawn' and pj.status = 'operating'), 0) as planted
        from public.parcels pa
        join public.projects pj on pj.id = pa.project_id
      ) t
    )
  end
$$;

comment on function public.million_progress() is
  'Aggregate counters for the public «million olive trees» section, split by stage (spec v2 §6). Counts only, never personal data (MIL-01). Returns null to API callers while the public_statistics module is closed to them (§54).';

revoke execute on function public.million_progress() from public;
grant execute on function public.million_progress() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The module (§54)
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('public_statistics', 'public', 1, 'الإحصائيات العمومية',
   'عدّاد «وين وصلنا؟» في الصفحة الرئيسية: الزيتونات المطلوبة والمحجوزة والمتعاقد عليها والمغروسة (البندان 6 و54). الصفحة الرئيسية تُحضَّر مسبقاً لكل الزوار، لذلك «داخلي فقط» يخفي العدّاد منها كما يفعل «معطّل».',
   35)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tile labels and hints (MIL-02, PRN-02). An empty label hides its tile; an empty hint hides the hint.
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('million.tile_requested_label', to_jsonb('زيتونات مطلوبة'::text),
   'text', 'site', 'عنوان خانة «زيتونات مطلوبة»', 'مجموع الزيتونات في مطالب الناس (البند 6). اتركه فارغاً لإخفاء الخانة.', true, 170),
  ('million.tile_requested_label_fr', to_jsonb('Oliviers demandés'::text),
   'text', 'site', 'عنوان خانة «زيتونات مطلوبة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 171),
  ('million.tile_requested_hint', to_jsonb('مجموع الزيتونات الموجودة في مطالب المستخدمين.'::text),
   'text', 'site', 'شرح خانة «زيتونات مطلوبة»', 'سطر صغير تحت الرقم. نص البند 6.', true, 172),
  ('million.tile_requested_hint_fr', to_jsonb('Somme des oliviers indiqués dans les demandes.'::text),
   'text', 'site', 'شرح خانة «زيتونات مطلوبة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 173),

  ('million.tile_reserved_label', to_jsonb('زيتونات محجوزة'::text),
   'text', 'site', 'عنوان خانة «زيتونات محجوزة»', 'زيتونات القطع المحجوزة (البند 6). اتركه فارغاً لإخفاء الخانة.', true, 174),
  ('million.tile_reserved_label_fr', to_jsonb('Oliviers réservés'::text),
   'text', 'site', 'عنوان خانة «زيتونات محجوزة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 175),
  ('million.tile_reserved_hint', to_jsonb('مرتبطة بحجوزات فعلية.'::text),
   'text', 'site', 'شرح خانة «زيتونات محجوزة»', 'سطر صغير تحت الرقم. نص البند 6.', true, 176),
  ('million.tile_reserved_hint_fr', to_jsonb('Liés à des réservations effectives.'::text),
   'text', 'site', 'شرح خانة «زيتونات محجوزة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 177),

  ('million.tile_contracted_label', to_jsonb('زيتونات تم التعاقد عليها'::text),
   'text', 'site', 'عنوان خانة «زيتونات تم التعاقد عليها»', 'زيتونات القطع في طور التعاقد أو المتعاقد عليها أو المملوكة (البند 6). اتركه فارغاً لإخفاء الخانة.', true, 178),
  ('million.tile_contracted_label_fr', to_jsonb('Oliviers sous contrat'::text),
   'text', 'site', 'عنوان خانة «زيتونات تم التعاقد عليها» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 179),
  ('million.tile_contracted_hint', to_jsonb('عقود فعلية أو في طور الإمضاء.'::text),
   'text', 'site', 'شرح خانة «زيتونات تم التعاقد عليها»', 'مسودة، تُراجع من الإدارة: الرقم يشمل القطع في طور التعاقد.', true, 180),
  ('million.tile_contracted_hint_fr', to_jsonb('Contrats signés ou en cours de signature.'::text),
   'text', 'site', 'شرح خانة «زيتونات تم التعاقد عليها» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 181),

  ('million.tile_planted_label', to_jsonb('زيتونات مغروسة / موجودة فعلياً'::text),
   'text', 'site', 'عنوان خانة «زيتونات مغروسة»', 'زيتونات القطع غير المسحوبة في المشاريع التي دخلت طور الاستغلال (البند 6). اتركه فارغاً لإخفاء الخانة.', true, 182),
  ('million.tile_planted_label_fr', to_jsonb('Oliviers plantés / existants'::text),
   'text', 'site', 'عنوان خانة «زيتونات مغروسة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 183),
  ('million.tile_planted_hint', to_jsonb('مشاريع منجزة.'::text),
   'text', 'site', 'شرح خانة «زيتونات مغروسة»', 'سطر صغير تحت الرقم. نص البند 6.', true, 184),
  ('million.tile_planted_hint_fr', to_jsonb('Projets réalisés.'::text),
   'text', 'site', 'شرح خانة «زيتونات مغروسة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 185),

  ('million.tile_participants_label', to_jsonb('عدد المشاركين'::text),
   'text', 'site', 'عنوان خانة «عدد المشاركين»', 'اتركه فارغاً لإخفاء الخانة.', true, 186),
  ('million.tile_participants_label_fr', to_jsonb('Participants'::text),
   'text', 'site', 'عنوان خانة «عدد المشاركين» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 187),
  ('million.tile_participants_hint', to_jsonb('كل شخص يُحتسب مرة واحدة.'::text),
   'text', 'site', 'شرح خانة «عدد المشاركين»', 'سطر صغير تحت الرقم.', true, 188),
  ('million.tile_participants_hint_fr', to_jsonb('Chaque personne est comptée une seule fois.'::text),
   'text', 'site', 'شرح خانة «عدد المشاركين» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 189),

  ('million.tile_projects_label', to_jsonb('مشاريع قيد الدراسة'::text),
   'text', 'site', 'عنوان خانة «مشاريع قيد الدراسة»', 'اتركه فارغاً لإخفاء الخانة.', true, 190),
  ('million.tile_projects_label_fr', to_jsonb('Projets à l''étude'::text),
   'text', 'site', 'عنوان خانة «مشاريع قيد الدراسة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 191),
  ('million.tile_projects_hint', to_jsonb('عقارات تحت الدراسة قبل أي عرض.'::text),
   'text', 'site', 'شرح خانة «مشاريع قيد الدراسة»', 'سطر صغير تحت الرقم.', true, 192),
  ('million.tile_projects_hint_fr', to_jsonb('Terrains étudiés avant toute offre.'::text),
   'text', 'site', 'شرح خانة «مشاريع قيد الدراسة» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 193),

  ('million.goal_label', to_jsonb('الهدف: {goal} زيتونة'::text),
   'text', 'site', 'سطر الهدف في قسم التقدّم', '{goal} يُستبدل بقيمة «هدف مشروع المليون زيتونة». اتركه فارغاً لإخفائه.', true, 194),
  ('million.goal_label_fr', to_jsonb('Objectif : {goal} oliviers'::text),
   'text', 'site', 'سطر الهدف في قسم التقدّم (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 195),
  ('million.bar_caption', to_jsonb('{count} زيتونة مطلوبة من {goal} · {share}'::text),
   'text', 'site', 'السطر تحت شريط التقدّم', '{count} الزيتونات المطلوبة، {goal} الهدف، {share} النسبة الحقيقية.', true, 196),
  ('million.bar_caption_fr', to_jsonb('{count} oliviers demandés sur {goal} · {share}'::text),
   'text', 'site', 'السطر تحت شريط التقدّم (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 197),
  ('million.bar_empty', to_jsonb('المشروع في بدايته: مازال ما وصلنا حتى مطلب بعدد زيتونات محدّد.'::text),
   'text', 'site', 'السطر تحت شريط التقدّم قبل أول مطلب', 'يظهر ما دام مجموع الزيتونات المطلوبة صفراً.', true, 198),
  ('million.bar_empty_fr', to_jsonb('Le projet commence : aucune demande avec un nombre d''oliviers pour l''instant.'::text),
   'text', 'site', 'السطر تحت شريط التقدّم قبل أول مطلب (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 199),
  ('million.share_below', to_jsonb('أقل من {share}'::text),
   'text', 'site', 'نسبة صغيرة جداً', 'تُكتب بدل تقريب نسبة حقيقية صغيرة إلى رقم أكبر. {share} يُستبدل بأصغر نسبة تُعرض.', true, 200),
  ('million.share_below_fr', to_jsonb('Moins de {share}'::text),
   'text', 'site', 'نسبة صغيرة جداً (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 201)
on conflict (key) do nothing;
