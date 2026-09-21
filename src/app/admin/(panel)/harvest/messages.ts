/**
 * The Arabic of every code bb_41 raises, each saying what happened AND the next step.
 *
 * These lines belong in src/lib/errors.ts, keyed by the code exactly as the rest are. That file is shared and
 * is not this run's to edit, so the module carries its own map and consults it FIRST — the same arrangement the
 * reservations module already uses for its own `module_closed` wording (see the note at src/lib/errors.ts).
 * When the codes move into errors.ts, delete this file and call intakeErrorMessage() alone.
 */

import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";

const HARVEST_MESSAGES: Record<string, string> = {
  // The module gate, named. errors.ts answers this code for modules that cannot name themselves; the harvest
  // can, and «شغّلو من الإعدادات» is a great deal more useful when it says which switch.
  module_closed:
    "وحدة «الصابة والجني» مازالت معطّلة، فالعملية هذي موقّفة. شغّلها من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم بيها الفريق.",

  harvest_season_exists:
    "فما موسم مسجّل في هذا العرض لنفس السنة. كمّل في الموسم الموجود، ولا الغي الموسم القديم قبل ما تعاود تسجّل.",
  harvest_season_settled:
    "هذا الموسم توزّعت حصصه، وما عادش يتبدّل — أرقام وصلت للملّاك ما تتعدّلش في السرّ. إذا فما غلطة، سجّل موسم جديد ووضّح في الملاحظة.",
  harvest_not_closed:
    "الحصص ما تتوزّعش قبل ما يكمل الجني، لأنّ الكميات مازالت تتبدّل. بدّل حالة الموسم لـ«تكمّل الجني» ثم أعد المحاولة.",
  harvest_quantity_missing:
    "ما فماش كمية زيتون مسجّلة في هذا الموسم، وما فماش شنوّة يتقسّم. اكتب «الكمية الحقيقية» بالكيلو ثم وزّع الحصص.",
  harvest_denominator_missing:
    "عدد الزيتونات اللي تجنّات ناقص ولا أصغر من زيتونات مالك واحد، والحصّة ما تتحسبش من عدد غالط. اكتب عدداً صحيحاً في «الزيتونات اللي تجنّات» — على الأقل قدّ عدد الزيتونات المباعة.",
  invalid_harvest_status:
    "هذا التغيير في حالة الموسم موش مسموح. المسار هو: مبرمج ← في الجني ← تكمّل الجني ← توزيع الحصص. و«توزّعت الحصص» تجي من زرّ التوزيع برك.",
  invalid_harvest_season: "هذا الموسم ما عادش موجود ولا تلغى. حدّث الصفحة واختر موسماً آخر.",
  invalid_harvest_facts:
    "راجع القيم: الكميات بالأرقام (صفر ولا أكثر)، والسنة بين 2000 و2100، وتاريخ نهاية الجني موش قبل بدايته.",
  harvest_choice_not_offered:
    "هذا الاختيار موش من اختيارات هذا العرض. اختر من القائمة المعروضة، ولا زيده في «الجني في العروض» أولاً.",
  harvest_choice_closed:
    "باب الاختيار في هذا الموسم تسكّر في التاريخ المحدّد. الاختيار الافتراضي متاع العرض هو اللي يمشي. إذا لازم يتبدّل، اطلب من الإدارة تسجّله.",
  not_a_tree_holder:
    "هذا الحريف ما عندوش زيتونات مباعة في هذا العرض، فما عندوش شنوّة يختار. تثبّت من العرض، ولا سجّل البيع في الزيتونات أولاً.",
  offer_has_no_harvest_choices:
    "هذا العرض ما حدّدش اختيارات الجني. زيدهم في «الجني في العروض» تحت الصفحة، ثم أعد المحاولة.",
};

export function harvestErrorMessage(error: { message: string; code?: string } | null): string {
  if (!error) return "";
  const named = HARVEST_MESSAGES[error.message];
  if (named) return named;
  if (isKnownIntakeError(error.message)) return intakeErrorMessage(error.message);
  // A refused grant the RPC did not name itself.
  if (error.code === "42501") return intakeErrorMessage("forbidden");
  return "تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.";
}
