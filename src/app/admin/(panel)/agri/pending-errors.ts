// The codes supabase/pending/bb_40_agri_services.sql raises, in Arabic, each saying what went wrong AND what
// to do about it — the rule src/lib/errors.ts states in its first line.
//
// THEY BELONG IN src/lib/errors.ts. They are here for one reason: three teams are building in the same hour
// and that file is shared, so three agents editing it at once would collide — exactly the reason
// RESERVATION_MESSAGES sits in src/app/admin/(panel)/reservations/actions.ts today, and errors.ts says so in
// its own comment. Whoever merges the batch copies the block below verbatim into MESSAGES and deletes this
// file; until then agriErrorMessage() consults it first and falls back to intakeErrorMessage() for every code
// the rest of the product already speaks (forbidden, invalid_person, invalid_tree_selection…).
//
// TWO keys here also exist in @/lib/errors on purpose. `module_closed` is raised by every module-gated RPC in
// the product, so errors.ts answers it in module-neutral words; this map is consulted first, which is how the
// two lines below get to name the module and the switch that turns it on. `invalid_tree_selection` is
// re-worded because in this module the selection is a set of the offer's own trees, not a basket size.

import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";

export const AGRI_MESSAGES: Record<string, string> = {
  // ---- the gate -----------------------------------------------------------
  module_closed:
    "موديول «العمليات الفلاحية» ولا «الاشتراك السنوي» مازال معطّل، فالتسجيل موقّف في قاعدة البيانات روحها. شغّلو من الإعدادات ← الموديولات: «داخلي فقط» باش يخدم الفريق برك، ولا «منشور للعموم» كي تكون جاهز.",

  // ---- the tariff (§36 Price · Frequency · Provider) -----------------------
  service_not_in_offer:
    "هذه الخدمة موش من خدمات هذا العرض، فما ينجمش يتحسب عليها ثمن. زيدها في «الخدمات» في بطاقة العرض، ولا اختر خدمة أخرى.",
  package_service_has_price:
    "الخدمة اللي داخل الباقة السنوية ما عندهاش ثمن مستقل: ثمنها هو المعاليم السنوية اللي تتعرض في صفحة العرض. خلّي المبلغ صفر، ولا نحّي «داخل الباقة» إذا تحب تحسب عليها ثمن زائد.",
  invalid_service:
    "هذه الخدمة ما عادتش موجودة ولا تعطّلت. اختر خدمة من القائمة، ولا رجّعها من الإعدادات ← القوائم ← «خدمات AgriZed».",
  invalid_service_basis:
    "اختر كيفاش يتحسب الثمن: للزيتونة، ولا للموسم، ولا للمرة.",
  invalid_service_amount:
    "اكتب المبلغ بالدينار، صفر ولا أكثر. مثال: 3 ولا 3.500",
  invalid_frequency:
    "الدورية هاذي ما عادتش متاحة. اختر وحدة من القائمة، ولا زيدها في الإعدادات ← القوائم ← «دورية الخدمة».",
  invalid_provider:
    "المنفّذ هذا ما عادش متاح. اختر واحد من القائمة، ولا زيدو في الإعدادات ← القوائم ← «منفّذ الخدمة».",
  service_terms_not_found:
    "هذا السطر ما عادش موجود. حدّث الصفحة وأعد الفتح من قائمة خدمات العرض.",
  service_terms_exists:
    "هذه الخدمة عندها ثمن مسجّل في هذا العرض. بدّل السطر الموجود بدل ما تزيد واحد جديد.",

  // ---- the work (v2 §41) --------------------------------------------------
  operation_date_required:
    "العملية المنجزة لازمها تاريخ الإنجاز. اكتب نهار شنوّة تعملت، ولا خلّيها «مخطّطة» كان مازالت ما تعملتش.",
  invalid_operation_status:
    "حالة العملية موش صحيحة: اختر «مخطّطة» ولا «منجزة» ولا «ملغاة».",
  invalid_operation_cost:
    "اكتب الكلفة بالدينار، صفر ولا أكثر، ولا خلّيها فارغة كان مازالت ما تعرفتش.",
  operation_not_found:
    "هذه العملية ما عادتش موجودة. حدّث الصفحة وأعد الفتح من قائمة العمليات.",
  invalid_tree_selection:
    "الزيتونات اللي اخترتهم موش الكل من هذا العرض. اختر زيتونات من نفس العرض، ولا خلّي الاختيار فارغ باش تكون العملية على الضيعة الكل.",

  // ---- the package (v2 §40, §36 Status + Payment) --------------------------
  no_trees_held:
    "هذا الحريف ما عندو حتى زيتونة مباعة في هذا العرض، فما فماش شنوّة يتشرّك فيه. سجّل زيتوناتو كـ«مباعة» في صفحة العرض أولاً، ولا اكتب عدد الزيتونات بيدك كان العقد تعمل على الورق.",
  offer_has_no_package:
    "هذا العرض ما عندو حتى خدمة داخل الباقة السنوية، فالاشتراك ما عندو شنوّة يغطّي. حدّد خدمات الباقة في صفحة العمليات الفلاحية ← خدمات العرض، ثم أعد المحاولة.",
  annual_fee_not_set:
    "ما فماش معاليم سنوية محدّدة لا في هذا العرض ولا في التسعير العام، فما نجمناش نحسبو الاشتراك. اكتب «معاليم الصيانة والتقليم في العام» في صفحة التسعير، ثم أعد المحاولة.",
  subscription_exists:
    "هذا الحريف عندو اشتراك في هذا العرض لنفس الموسم. افتح الاشتراك الموجود وبدّل فيه بدل ما تعمل واحد جديد — اشتراكين معناهم معاليم سنوية مرّتين.",
  subscription_not_found:
    "هذا الاشتراك ما عادش موجود. حدّث الصفحة وأعد الفتح من قائمة الاشتراكات.",
  invalid_subscription_status:
    "حالة الاشتراك موش صحيحة: اختر «مسوّدة» ولا «نشيط» ولا «مرفوض» ولا «منتهي» ولا «ملغى».",
  invalid_payment_status:
    "حالة الخلاص موش صحيحة: اختر «ما تخلّصش» ولا «خلاص جزئي» ولا «مخلّص».",
};

/** This module's Arabic first, then everything the product already says. */
export function agriErrorMessage(code: string | undefined | null): string {
  return (code && AGRI_MESSAGES[code]) || intakeErrorMessage(code);
}

export function isKnownAgriError(code: string | undefined | null): boolean {
  return Boolean(code && (code in AGRI_MESSAGES || isKnownIntakeError(code)));
}
