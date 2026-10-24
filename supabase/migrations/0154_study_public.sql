-- 0154 · the door a visitor reads the study through, and the words around it.
--
-- Its test is supabase/tests/101_study_public.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0154_study_public.sql supabase/tests/101_study_public.sql
--
-- 0152 holds the figures, 0153 does the arithmetic — and neither may be reached from a browser: between
-- them they read AgriZed's yields, its charges and the basis its prices are built on, and §10 keeps those
-- inside. This is the one function a visitor may call, and it publishes RESULTS.
--
-- WHAT IT TAKES OUT OF THE PAYLOAD, and why so little. §4 lists what the client is to be shown and it is
-- almost everything: the trees, the price, the production, the revenue, the charges, the result, the
-- percentages, and a year-by-year table to draw. §6C is explicit that the charges are «المصاريف والرسوم
-- الأخرى التي يتحملها الحريف» — what HE pays, not what AgriZed pays — so a charges total is his to see. The
-- two things that do not travel are the scenario's FACTORS and the yield band's source note: the first is
-- the shape of the company's own pessimism, the second is an internal remark to whoever maintains the table.
--
-- NO ACCOUNT NEEDED, which the owner asked for in his last paragraph: «نقترح نخليوا الوظيفة متاحة للزائر
-- قبل التسجيل، باش يشوف النتائج ويتشجّع». Signing in is asked for later — to save a study, to download it
-- under a name, to send a request — and never to see the figures.
--
-- THE MODULE GATE IS THE WHOLE SAFETY CATCH. While `study` is «داخلي فقط» this answers staff and refuses
-- everyone else, so the owner can read the numbers on the real site before a client ever can.

create or replace function public.public_project_study(
  p_project  uuid,
  p_trees    integer default 1,
  p_years    integer default 10,
  p_scenario text default null,
  p_mode     text default 'olives',
  p_payment  text default null,
  p_down     uuid default null,
  p_duration uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pj    public.projects;
  v_out   jsonb;
  v_rows  jsonb;
begin
  if not app.module_open('study') then
    return jsonb_build_object('status', 'closed');
  end if;

  -- A visitor may only ask about an offer that is published. An unpublished one is not refused loudly: it
  -- is simply not there, the same answer public_projects gives.
  select * into v_pj from public.projects p where p.id = p_project and p.status = 'published';
  if not found then
    return null;
  end if;

  v_out := app.study_payload(p_project, p_trees, p_years, p_scenario, p_mode, p_payment, p_down, p_duration);
  if v_out is null or (v_out->>'status') <> 'ok' then
    -- «closed» and «incomplete» already carry only a status, a name and the warning. Nothing to strip.
    return v_out;
  end if;

  -- The scenario travels by name only: its factors are how pessimistic the company has decided to be, and
  -- a reader who can see them can work backwards to the reference assumptions.
  v_out := jsonb_set(v_out, '{scenario}', jsonb_build_object(
    'code', v_out->'scenario'->>'code',
    'label_ar', v_out->'scenario'->>'label_ar'));

  -- The list the screen draws its three buttons from, in the Back Office's order.
  select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'label_ar', s.label_ar)
                            order by s.sort_order), '[]'::jsonb)
    into v_rows
    from public.study_scenarios s
   where s.is_active;

  return v_out || jsonb_build_object('scenarios', v_rows);
end $fn$;

revoke execute on function public.public_project_study(uuid, integer, integer, text, text, text, uuid, uuid)
  from public;
grant execute on function public.public_project_study(uuid, integer, integer, text, text, text, uuid, uuid)
  to anon, authenticated;

comment on function public.public_project_study(uuid, integer, integer, text, text, text, uuid, uuid) is
  'The profitability study as a visitor reads it: results, never workings. Gated on the `study` module, so «داخلي فقط» answers staff and nobody else. The scenario''s multipliers and the yield bands'' internal notes are stripped; everything §4 asks to show travels. No account needed — signing in is asked for to SAVE a study, not to see one.';

-- ---------------------------------------------------------------------------
-- The words. Nothing here decides anything: these are the labels on the form
-- and the headings over the figures.
-- ---------------------------------------------------------------------------

create temp table _study_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _study_texts values
  ('ui.study.cta', 10, 'زرّ فتح المحاكي', 'في صفحة كل عرض.',
   'احسب مردودية مشروعك', 'Calculez la rentabilité de votre projet', 'Berechnen Sie die Rentabilität Ihres Projekts',
   'Calcola la redditività del tuo progetto', 'Work out what your project could return'),

  ('ui.study.title', 11, 'عنوان صفحة الدراسة', '',
   'دراسة مردودية', 'Étude de rentabilité', 'Rentabilitätsstudie', 'Studio di redditività', 'Profitability study'),

  ('ui.study.intro', 12, 'سطر تحت العنوان', 'لازم يقول من الأوّل إنّ الأرقام فرضيات.',
   'بدّل الفرضيات وشوف كيفاش تتبدّل النتائج. كل الأرقام تقديرية.',
   'Modifiez les hypothèses et voyez les résultats changer. Tous les chiffres sont des estimations.',
   'Ändern Sie die Annahmen und sehen Sie, wie sich die Ergebnisse ändern. Alle Zahlen sind Schätzungen.',
   'Modifica le ipotesi e guarda cambiare i risultati. Tutte le cifre sono stime.',
   'Change the assumptions and watch the results move. Every figure is an estimate.'),

  ('ui.study.trees', 20, 'عدد الزيتونات', '', 'عدد الزيتونات', 'Nombre d''oliviers', 'Anzahl Olivenbäume', 'Numero di ulivi', 'Olive trees'),
  ('ui.study.years', 21, 'مدّة الدراسة', '', 'مدّة الدراسة', 'Durée de l''étude', 'Dauer der Studie', 'Durata dello studio', 'Study period'),
  ('ui.study.years_unit', 22, 'وحدة المدّة', '', 'سنوات', 'ans', 'Jahre', 'anni', 'years'),
  ('ui.study.scenario', 23, 'السيناريو', '', 'السيناريو', 'Scénario', 'Szenario', 'Scenario', 'Scenario'),
  ('ui.study.mode', 24, 'شنوّة يعمل بالصابة', '', 'الصابة', 'La récolte', 'Die Ernte', 'Il raccolto', 'The harvest'),
  ('ui.study.mode_olives', 25, 'يبيع الزيتون', '', 'نبيع الزيتون', 'Vendre les olives', 'Oliven verkaufen', 'Vendere le olive', 'Sell the olives'),
  ('ui.study.mode_oil', 26, 'يعصر ويبيع الزيت', '', 'نعصرو ونبيع الزيت', 'Presser et vendre l''huile', 'Pressen und Öl verkaufen', 'Press it and sell the oil', 'Press it and sell the oil'),

  ('ui.study.investment', 30, 'عنوان كتلة الاستثمار', '', 'الاستثمار', 'Investissement', 'Investition', 'Investimento', 'Investment'),
  ('ui.study.production', 31, 'عنوان كتلة الإنتاج', '', 'الإنتاج في العام', 'Production annuelle', 'Jahresproduktion', 'Produzione annua', 'Annual production'),
  ('ui.study.finance', 32, 'عنوان كتلة الدراسة المالية', '', 'الدراسة المالية', 'Étude financière', 'Finanzielle Auswertung', 'Analisi finanziaria', 'The financial picture'),

  ('ui.study.price_per_tree', 40, 'سعر الزيتونة', '', 'سعر الزيتونة', 'Prix de l''olivier', 'Preis je Baum', 'Prezzo per ulivo', 'Price per tree'),
  ('ui.study.total_price', 41, 'الثمن الجملي', '', 'الثمن الجملي', 'Prix total', 'Gesamtpreis', 'Prezzo totale', 'Total price'),
  ('ui.study.invested', 42, 'اللي يخلّصو في المدّة', 'التسبقة + الأقساط اللي تطيح في المدّة.',
   'اللي باش تخلّصو في المدّة', 'Total versé sur la période', 'Gesamt gezahlt im Zeitraum',
   'Totale versato nel periodo', 'Paid in over the period'),
  ('ui.study.kg_total', 43, 'الإنتاج بالكيلو', '', 'الإنتاج في العام', 'Production par an', 'Ertrag pro Jahr', 'Produzione annua', 'Harvest per year'),
  ('ui.study.litres', 44, 'الزيت باللتر', '', 'الزيت في العام', 'Huile par an', 'Öl pro Jahr', 'Olio all''anno', 'Oil per year'),
  ('ui.study.revenue', 45, 'المداخيل', '', 'المداخيل', 'Revenus', 'Einnahmen', 'Ricavi', 'Revenue'),
  ('ui.study.charges', 46, 'المصاريف', '', 'المصاريف', 'Charges', 'Kosten', 'Costi', 'Costs'),
  ('ui.study.net', 47, 'الصافي', '', 'الصافي', 'Résultat net', 'Nettoergebnis', 'Risultato netto', 'Net result'),
  ('ui.study.roi', 48, 'المردودية', '', 'المردودية على المدّة', 'Rentabilité sur la période', 'Rendite über den Zeitraum', 'Redditività sul periodo', 'Return over the period'),
  ('ui.study.payback', 49, 'استرجاع رأس المال', '', 'استرجاع رأس المال', 'Récupération du capital', 'Amortisationsdauer', 'Recupero del capitale', 'Capital recovered'),
  ('ui.study.payback_year', 50, 'في السنة كذا', 'يتعوّض فيه {year}.',
   'في السنة {year}', 'En année {year}', 'Im Jahr {year}', 'Nell''anno {year}', 'In year {year}'),
  ('ui.study.payback_never', 51, 'ما يترجعش في المدّة', '',
   'ما يترجعش في هالمدّة', 'Pas récupéré sur cette période', 'In diesem Zeitraum nicht erreicht',
   'Non recuperato in questo periodo', 'Not recovered in this period'),

  ('ui.study.table', 60, 'عنوان الجدول', '', 'سنة بسنة', 'Année par année', 'Jahr für Jahr', 'Anno per anno', 'Year by year'),
  ('ui.study.year', 61, 'عمود السنة', '', 'السنة', 'Année', 'Jahr', 'Anno', 'Year'),
  ('ui.study.cumulative', 62, 'عمود المتراكم', '', 'المتراكم', 'Cumulé', 'Kumuliert', 'Cumulato', 'Cumulative'),

  ('ui.study.incomplete', 70, 'كي تنقص معطيات', 'لازم يقول شنوّة ناقص، موش «خطأ».',
   'ما نجّمناش نكمّلو الدراسة على هذا العرض: المعطيات التالية مازالت ناقصة.',
   'Nous ne pouvons pas terminer l''étude sur cette offre : les données suivantes manquent encore.',
   'Wir können die Studie für dieses Angebot nicht abschließen: Die folgenden Angaben fehlen noch.',
   'Non possiamo completare lo studio per questa offerta: mancano ancora i dati seguenti.',
   'We cannot finish the study for this offer: the following is still missing.'),
  ('ui.study.missing_tree_age', 71, 'ناقص: عمر الزيتون', '', 'عمر الزيتون في هذا العرض',
   'L''âge des oliviers de cette offre', 'Das Alter der Olivenbäume dieses Angebots',
   'L''età degli ulivi di questa offerta', 'The age of this offer''s olive trees'),
  ('ui.study.missing_yield_band', 72, 'ناقص: الإنتاج في هالعمر', '', 'الإنتاج المفترض في هذا العمر',
   'La production attendue à cet âge', 'Der erwartete Ertrag in diesem Alter',
   'La produzione attesa a quest''età', 'The expected yield at that age'),
  ('ui.study.missing_offer_price', 73, 'ناقص: ثمن العرض', '', 'ثمن هذا العرض',
   'Le prix de cette offre', 'Der Preis dieses Angebots', 'Il prezzo di questa offerta', 'The price of this offer'),
  ('ui.study.missing_olive_price', 74, 'ناقص: سعر الزيتون', '', 'سعر بيع الزيتون',
   'Le prix de vente des olives', 'Der Verkaufspreis der Oliven', 'Il prezzo di vendita delle olive', 'The selling price of olives'),
  ('ui.study.missing_oil_price', 75, 'ناقص: سعر الزيت', '', 'سعر بيع الزيت ومردود العصر',
   'Le prix de l''huile et le rendement du pressage', 'Der Ölpreis und die Pressausbeute',
   'Il prezzo dell''olio e la resa di frangitura', 'The oil price and the pressing yield');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 800 + sort
from _study_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _study_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
