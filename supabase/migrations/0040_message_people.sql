-- Pending · The owner's second pass on the message (2026-09-16): the goal is not the number.
--   «الهدف مش الوصول لرقم مليون زيتونة، بل كم شخص نقدر نعاونوه باش يبني أصل يقوّي دخله»
-- Two slogans he wrote go in beside the ones already there, the counter says out loud what it is not,
-- and instalments are named for what they do: turn saving into something you can stand on.
-- Spec: HOME-01, MIL-02, PRN-01 (nothing promised). Number claimed at apply time.

-- ---------------------------------------------------------------------------
-- 1 · The hero: his slogan above the title, and what AgriZed does under it
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$قوّي دخلك بزيتونتك$t$::text) where key = 'site.hero_eyebrow';

update public.settings set value = to_jsonb($t$أصل حيّ تبنيه على قدّ إمكانياتك ويكبر معاك. AgriZed تمكّن أي شخص من امتلاك زيتونة مرتبطة بأرض، تكبر وتثمر مع الوقت.$t$::text)
  where key = 'site.home_subheadline';

-- ---------------------------------------------------------------------------
-- 2 · The counter says what it is not: a target to reach, instead of people helped
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$الهدف عندنا موش نوصلو لرقم، بل قدّاش من شخص نعاونوه يبني أصل يقوّي دخله. الأرقام هذي حقيقية وتتحدّث مع كل مطلب جديد، بلا تقديرات ولا وعود.$t$::text)
  where key = 'site.progress_note';

-- ---------------------------------------------------------------------------
-- 3 · Instalments: what a small monthly amount turns into
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$التقسيط وسيلة تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل حقيقي وملموس. هذي قدرتك، موش سعر مشروع.$t$::text)
  where key = 'start.capacity_hint';
update public.settings set value = to_jsonb($t$Les mensualités facilitent le départ : un petit montant mensuel transforme votre épargne en un actif réel et tangible. C est votre capacité, pas le prix d un projet.$t$::text)
  where key = 'start.capacity_hint_fr';

update public.settings set value = to_jsonb($t$حاضر، أو تسبقة ثم أقساط شهرية تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل ملموس. التفاصيل تتحسب لكل قطعة، والمبلغ النهائي والمدة يُضبطان في وعد البيع.$t$::text)
  where key = 'projects.payment_text';

-- ---------------------------------------------------------------------------
-- 4 · His two slogans join the ones already on the calculator, they do not replace them
-- ---------------------------------------------------------------------------

update public.settings set value = $json$[
  {"ar": "زيتونتك هي مشروعك", "fr": "Votre olivier, votre projet", "icon": "people"},
  {"ar": "أصل حيّ تبنيه على قدّ إمكانياتك ويكبر معاك", "fr": "Un actif vivant, à votre mesure, qui grandit avec vous", "icon": "leaf"},
  {"ar": "قوّي دخلك بزيتونتك", "fr": "Renforcez vos revenus avec votre olivier", "icon": "chart"},
  {"ar": "زيتونة مرتبطة بأرض، تكبر وتثمر مع الوقت", "fr": "Un olivier lié à une terre, qui grandit et produit avec le temps", "icon": "leaf"},
  {"ar": "تبدا على قدّ إمكانياتك", "fr": "Vous commencez à votre mesure", "icon": "hand"},
  {"ar": "إنت تستثمر، وإحنا نتلهاو", "fr": "Vous investissez, nous assurons le suivi", "icon": "chart"}
]$json$::jsonb where key = 'start.values';

-- ---------------------------------------------------------------------------
-- 5 · The section that opens the tree question keeps the same promise-free framing
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t$ما ثمّاش بداية صغيرة. زيتونة، ولا 25، ولا 250: الكل أصل حقيقي باسمك، مرتبط بأرض، يكبر ويثمر مع السنين. تبدا على قدّ إمكانياتك وتزيد وقت اللي تحب.$t$::text)
  where key = 'site.start_text';
