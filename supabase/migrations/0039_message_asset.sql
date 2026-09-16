-- Pending · The message the owner set on 2026-09-16: the visitor builds a living asset, not a number.
--   «زيتونتك هي مشروعك، أصل حي تبنيه على قد إمكانياتك وينجم يقوي دخلك»
-- The million stays on the site as a real counter, but it stops being what the pages lead with. Instalments
-- are framed as the way to start, and the follow-up AgriZed sells for a known fee gets its own home section.
-- Spec: HOME-01, PRN-01 (nothing promised), §53 vocabulary. Number claimed at apply time.

-- ---------------------------------------------------------------------------
-- 1 · The hero and what the site says it is
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$ملكية حقيقية تبدا بزيتونة$t$::text) where key = 'site.hero_eyebrow';
update public.settings set value = to_jsonb($t$زيتونتك هي مشروعك$t$::text) where key = 'site.home_headline';
update public.settings set value = to_jsonb($t$أصل حيّ تبنيه على قدّ إمكانياتك، وينجم يقوي دخلك. تبدا بزيتونة وحدة، وAgriZed تتلهى بالمتابعة.$t$::text)
  where key = 'site.home_subheadline';

update public.settings set value = to_jsonb($t$AgriZed · زيتونتك هي مشروعك$t$::text) where key = 'site.meta_title';
update public.settings set value = to_jsonb($t$Votre olivier, votre projet · AgriZed$t$::text) where key = 'site.meta_title_fr';
update public.settings set value = to_jsonb($t$أصل حيّ على قدّ إمكانياتك: زيتونة بمساحتها، خلاص بالحاضر ولا بأقساط شهرية بسيطة، ومتابعة وخدمات فلاحية من AgriZed بمقابل معلوم.$t$::text)
  where key = 'site.meta_description';
update public.settings set value = to_jsonb($t$Un actif vivant à votre mesure : un olivier avec sa surface, au comptant ou en mensualités, avec le suivi et les services agricoles AgriZed à un tarif connu.$t$::text)
  where key = 'site.meta_description_fr';

update public.settings set value = to_jsonb($t$سجّل اهتمامك: قدّاش زيتونة تحب تبدا بيهم، وين، وكيفاش تحب تخلّص. التسجيل مجاني ولا يمثل التزاماً بالشراء.$t$::text)
  where key = 'site.register_meta_description';
update public.settings set value = to_jsonb($t$Enregistrez votre intérêt : combien d oliviers, où, et comment vous souhaitez payer. Inscription gratuite et sans engagement d achat.$t$::text)
  where key = 'site.register_meta_description_fr';

-- ---------------------------------------------------------------------------
-- 2 · «تبدا بزيتونة، ويكبر مع الوقت» — the section that used to lead with the million
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$تبدا بزيتونة، ويكبر مع الوقت$t$::text) where key = 'site.start_title';
update public.settings set value = to_jsonb($t$ما ثمّاش بداية صغيرة. زيتونة، ولا 25، ولا 250: الكل أصل حقيقي باسمك يكبر مع السنين. تبدا على قدّ إمكانياتك وتزيد وقت اللي تحب.$t$::text)
  where key = 'site.start_text';

update public.settings set value = $json$[
  {"value": "1 زيتونة", "label": "أصغر بداية: زيتونة وحدة بمساحتها، باسمك"},
  {"value": "0 د", "label": "التسجيل مجاني وما يلزمك بشيء"},
  {"value": "24", "label": "ولاية مفتوحة للتسجيل"}
]$json$::jsonb where key = 'site.facts';

update public.settings set value = $json$[
  {"title": "اختار على قدّ إمكانياتك", "text": "قدّاش زيتونة تحب تبدا بيهم، وكيفاش تحب تخلّص: بالحاضر ولا بأقساط شهرية. التسجيل مجاني."},
  {"title": "نلوّجو على الأرض المناسبة", "text": "نجمعو الطلبات باش نعرفو وين نبداو، وكل عقار يتدرس قانونياً وفنياً وميدانياً قبل ما يتعرض."},
  {"title": "نعلموك بالمشروع المطابق", "text": "كي يتوفّر مشروع يشبه طلبك، نتصلو بيك، تزور الأرض وتختار زيتوناتك."},
  {"title": "تتملّك وإحنا نتلهاو", "text": "بعد التعاقد الزيتونة تولّي باسمك، ونتابعوها معاك بخدمات فلاحية بمقابل معلوم."}
]$json$::jsonb where key = 'site.how_it_works';

-- ---------------------------------------------------------------------------
-- 3 · «إنت تستثمر، وإحنا نتلهاو» — the service is not only a sale (report v3 §36)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.services_title', to_jsonb($t$إنت تستثمر، وإحنا نتلهاو$t$::text), 'text', 'site',
   'عنوان قسم الخدمات في الرئيسية', 'يظهر فوق أسماء خدمات AgriZed. اتركه فارغاً باش يتخبّى القسم كامل.', true, 130),
  ('site.services_text', to_jsonb($t$AgriZed ما تبيعش وتخلّي. بعد التملّك نتابعو زيتونتك ونقدّمو الخدمات الفلاحية بمقابل معلوم ومتّفق عليه قبل، وإنت تتابع كل شيء من فضائك الخاص.$t$::text),
   'text', 'site', 'نص قسم الخدمات', 'تحت العنوان. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 131),
  ('site.services_note', to_jsonb($t$الخدمات اختيارية، وشروطها وأسعارها تتوضّح قبل الإمضاء.$t$::text), 'text', 'site',
   'ملاحظة تحت أسماء الخدمات', null, true, 132);

-- ---------------------------------------------------------------------------
-- 4 · Instalments as the way to start, on the calculator and on a project page
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$التقسيط باش تبدا بسهولة: مبلغ شهري بسيط يولّي أصل ملموس باسمك. هذي قدرتك، موش سعر مشروع.$t$::text)
  where key = 'start.capacity_hint';
update public.settings set value = to_jsonb($t$Les mensualités pour démarrer facilement : un petit montant mensuel devient un actif à votre nom. C est votre capacité, pas le prix d un projet.$t$::text)
  where key = 'start.capacity_hint_fr';

update public.settings set value = to_jsonb($t$حاضر، أو تسبقة ثم أقساط شهرية تسهّل البداية. التفاصيل تتحسب لكل قطعة، والمبلغ النهائي والمدة يُضبطان في وعد البيع.$t$::text)
  where key = 'projects.payment_text';

update public.settings set value = $json$[
  {"ar": "زيتونتك هي مشروعك", "fr": "Votre olivier, votre projet", "icon": "people"},
  {"ar": "أصل حيّ يكبر مع الوقت", "fr": "Un actif vivant qui grandit avec le temps", "icon": "leaf"},
  {"ar": "تبدا على قدّ إمكانياتك", "fr": "Vous commencez à votre mesure", "icon": "hand"},
  {"ar": "إنت تستثمر، وإحنا نتلهاو", "fr": "Vous investissez, nous assurons le suivi", "icon": "chart"}
]$json$::jsonb where key = 'start.values';

-- ---------------------------------------------------------------------------
-- 5 · The closing band, the last call, and the screen the visitor lands on after registering
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$إنت تستثمر، وإحنا نتلهاو بالمتابعة.$t$::text) where key = 'site.vision_text';
update public.settings set value = to_jsonb($t$ابدا أصلك اليوم، على قدّ إمكانياتك$t$::text) where key = 'site.final_cta_title';

update public.settings set value = to_jsonb($t$مرحباً بيك، زيتونتك بدات$t$::text) where key = 'register.success_welcome_title';
update public.settings set value = to_jsonb($t$مطلبك وصلنا وتسجّل باسمك. من هنا للأمام نرافقوك: نراجعو اختياراتك، نتصلو بيك، ونعرضو عليك المشروع اللي يناسب إمكانياتك.$t$::text)
  where key = 'register.success_welcome_text';
update public.settings set value = to_jsonb($t$كل زيتونة تبدا بيها اليوم تولّي أصل باسمك يكبر مع الوقت، وإحنا نتلهاو بالمتابعة.$t$::text)
  where key = 'register.success_motivation';
