-- Offer-type cards as data (WP-04). Spec: report v3 §3 and §40 (the four offer types, which win over v2 §8),
-- v2 §8 for the open choice the report does not mention, PARC-04, LEAD-01, LEAD-02, MED-01, PRN-02.
--
-- «كيفاش تحب مشروعك يكون؟» shows the report's four offer types in its order — زيتون منتج، غراسة جديدة،
-- زيتون مكثّف، أرض بيضاء — then «اقترحولي الأنسب». Each card's drawing, picture and French copy move from the
-- code to the scenario row. Demands keep their snapshots (LEAD-02), so the new wording and order only reach
-- new demands. Project type, plantation system and production status of existing cards are left as they are.

-- ---------------------------------------------------------------------------
-- What a card shows
-- ---------------------------------------------------------------------------

alter table public.ownership_scenarios
  add column description_fr text,
  add column icon_code      text,
  add column image_url      text,
  add column image_alt_ar   text,
  add column image_alt_fr   text;

alter table public.ownership_scenarios
  add constraint ownership_scenarios_icon_code_shape
    check (icon_code is null or icon_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- Same rule as site_media and project_types (0015): empty, or an absolute https address.
  add constraint ownership_scenarios_image_shape
    check (image_url is null or image_url ~ '^https://[^ ]+$'),
  add constraint ownership_scenarios_image_alt_needed
    check (image_url is null or (image_alt_ar is not null and length(btrim(image_alt_ar)) > 0));

comment on column public.ownership_scenarios.description_fr is
  'French line under description_ar on the bilingual /start page. Empty = only the Arabic shows.';
comment on column public.ownership_scenarios.icon_code is
  'Growth-stage drawing of the card (src/components/site/growth-icon.tsx). Empty or unknown = the generic leaf.';
comment on column public.ownership_scenarios.image_url is
  'Picture of the card, in the public site-media bucket. Empty = the drawing is shown instead (MED-01).';
comment on column public.ownership_scenarios.image_alt_ar is
  'Arabic alternative text. Required as soon as a picture is set, so the card stays accessible.';
comment on column public.ownership_scenarios.image_alt_fr is
  'French alternative text, read after the Arabic on the bilingual /start page.';

-- ---------------------------------------------------------------------------
-- The four offer types of the report, then the open choice
-- ---------------------------------------------------------------------------

-- A label takes the report's wording only while it still equals its 0010 seed, so AgriZed's own edits stay.
update public.ownership_scenarios s set
  label_ar   = case when s.label_ar = v.seed_ar then v.label_ar else s.label_ar end,
  label_fr   = case when s.label_fr is null or s.label_fr = v.seed_fr then v.label_fr else s.label_fr end,
  icon_code  = coalesce(s.icon_code, v.icon_code),
  sort_order = v.sort_order
from (values
  ('big_productive',  'قطعة فيها زيتون كبير ومنتج', 'Oliviers adultes et productifs',
   'زيتون منتج', 'Oliviers productifs', 'productive', 10),
  ('young_trees',     'زيتون صغير يكبر مع الوقت', 'Jeunes oliviers',
   'غراسة جديدة', 'Nouvelle plantation', 'young_olive', 20),
  ('intensive_grove', 'قطعة فيها غراسة مكثفة', 'Plantation intensive',
   'زيتون مكثّف', 'Oliviers en intensif', 'near_production', 30),
  ('bare_land',       'أرض بيضاء نغرسوها', 'Terre nue à planter',
   'أرض بيضاء', 'Terre nue', 'bare_land', 40),
  ('any',             'ما يهمنيش النوع، نحب العرض الأنسب حسب ميزانيتي', 'Peu importe, la meilleure offre selon mon budget',
   'اقترحولي الأنسب', 'Proposez-moi le plus adapté', 'other', 50)
) as v (code, seed_ar, seed_fr, label_ar, label_fr, icon_code, sort_order)
where s.code = v.code;
