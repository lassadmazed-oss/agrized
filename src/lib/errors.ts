// Arabic messages for error codes raised by the database intake functions.
// Each message says what went wrong and how to fix it (spec LEAD-10).

const MESSAGES: Record<string, string> = {
  invalid_full_name: "اكتب الاسم واللقب كاملين.",
  invalid_phone: "رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456.",
  phone_not_tunisian: "نقبل حالياً الأرقام التونسية فقط. اكتب رقماً يبدأ بـ ‎+216‎ أو من 8 أرقام.",
  invalid_whatsapp: "رقم WhatsApp غير صحيح. اكتب 8 أرقام، أو فعّل «نفس رقم الهاتف».",
  invalid_email: "البريد الإلكتروني غير صحيح. مثال: nom@exemple.tn",
  consent_required: "لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.",
  invalid_governorate: "اختر ولايتك من القائمة.",
  invalid_delegation: "اختر المعتمدية من القائمة.",
  invest_location_required: "اختر ولاية واحدة على الأقل، أو «المكان غير مهم».",
  invalid_invest_governorate: "إحدى الولايات المختارة لم تعد متاحة. أعد الاختيار.",
  scenario_required: "اختر شنوّة تحب تملك.",
  invalid_scenario: "أحد الاختيارات لم يعد متاحاً. أعد الاختيار.",
  single_scenario_only: "اختر خياراً واحداً فقط.",
  invalid_tree_choice: "اختر عدد الزيتونات من القائمة.",
  invalid_tree_custom: "اكتب عدد الزيتونات بالأرقام، ضمن الحدود المسموح بها.",
  invalid_desired_area: "اختر المساحة من القائمة.",
  invalid_priority: "اختر الأهم بالنسبة إليك من القائمة.",
  project_type_required: "اختر نوع مشروع واحداً على الأقل، أو «لا أعرف».",
  single_project_type_only: "اختر نوع مشروع واحداً فقط.",
  invalid_project_type: "أحد أنواع المشاريع المختارة لم يعد متاحاً. أعد الاختيار.",
  invalid_goal: "اختر هدفك من القائمة.",
  invalid_down_payment: "اختر التسبقة من القائمة.",
  invalid_installment: "اختر القسط الشهري من القائمة.",
  invalid_duration: "اختر مدة الدفع من القائمة.",
  invalid_budget: "اختر الميزانية من القائمة.",
  invalid_contact_time: "اختر الوقت المفضل من القائمة.",
  contact_channel_required: "اختر كيف تحب نتصلوا بيك.",
  rate_limited: "وصلنا عدد كبير من الطلبات من نفس المصدر. حاول مرة أخرى بعد ساعة.",
  invalid_area: "اكتب المساحة بالأرقام واختر الوحدة (هكتار أو م²).",
  invalid_tree_count: "اكتب عدد الزيتونات بالأرقام.",
  invalid_price: "اكتب السعر المطلوب بالأرقام، أو اتركه فارغاً.",
  invalid_property_type: "اختر نوع العقار من القائمة.",
  invalid_tree_age: "اختر عمر الأشجار من القائمة.",
  invalid_choice: "أحد الاختيارات غير صحيح. أعد الاختيار من القائمة.",
  // Raised by app.require_reason in sensitive Back Office RPCs (§51), not by the public intake.
  reason_required: "سبب التغيير ناقص أو قصير جداً. اكتب في خانة «سبب التغيير» جملة توضّح لماذا تقوم بهذا التغيير، ثم أعد الحفظ.",
  invalid_spacing: "اختر المساحة لكل زيتونة من القائمة، أو اتركها بلا اختيار.",
  invalid_payment_mode: "اختر طريقة الدفع: بالحاضر أو بالتقسيط.",
  invalid_down_payment_percent: "نسبة التسبقة اللي اخترتها ما عادتش متاحة. ارجع للحاسبة واختر نسبة أخرى.",
  down_payment_percent_required: "نسبة التسبقة ناقصة. ارجع للحاسبة واختر نسبة التسبقة، أو اختر الدفع بالحاضر.",
  duration_required: "مدة الدفع ناقصة. ارجع للحاسبة واختر مدة الدفع، أو اختر الدفع بالحاضر.",
  forbidden: "ما عندكش الصلاحية لهذه العملية. اطلب من المسؤول دور المالية أو الإدارة.",
  spacing_in_use: "هذه الفئة مستعملة في مطالب مسجّلة، لذلك ما تنجمش تتفسخ. عطّلها بدل الحذف.",
  invalid_spacing_class: "اكتب اسم الفئة والتباعد بين الصفوف وبين الزيتونات بالأمتار، بأرقام أكبر من صفر.",
  duplicate_code: "هذا الرمز مستعمل من قبل. اختر رمزاً آخر.",
  invalid_pricing_rule: "راجع قيم التسعير: الأسعار والتكاليف بالأرقام (صفر أو أكثر)، والهامش نسبة أو مبلغ.",
  invalid_cost_item: "اكتب اسم البند ومبلغه بالأرقام، واختر هل يُحسب للزيتونة أو للمتر المربع.",
  invalid_markup: "اكتب لكل مدة نسبة زيادة بين 0 و1000%، أو اتركها فارغة.",
  duration_over_cap: "هذه المدة أطول من الحدّ الأقصى المسموح (إعداد pricing.max_months). قصّرها أو غيّر الحدّ.",
  // The spacing guard on an offer's classes. `spacing_used_by_trees` is what app.check_project_class_in_use()
  // raises once supabase/pending/bb_03_parcel_layer_retires.sql retargets it at public.trees; the two parcel
  // codes above it are still raised by the live function today and go in the same commit as that draft, not
  // before it. Until then all three may arrive, so all three keep their line. 2026-09-19.
  spacing_used_by_trees:
    "فما زيتونات مرقّمة في هذا العرض، وفئة التباعد هذي هي اللي تحدّد مساحتها وسعرها. ما تنجمش تنحّيها. إذا تحب تبدّلها، فكّ الحجز على الزيتونات ولا اعمل عرض جديد.",
  parcel_spacing_not_in_project: "فئة التباعد هذه موش من فئات المشروع. اختر فئة من فئات المشروع، ولا زيدها للمشروع في صفحة التسعير.",
  spacing_used_by_parcels: "فما قطع في هذا المشروع مربوطة بهذه الفئة. بدّل فئة القطع هاذوما قبل ما تنحّيها من المشروع.",
  // The offer form (0049): its own two answers, checked against the offer itself.
  offer_not_available: "هذا العرض ما عادش متوفّر. شوف بقية العروض أو سجّل مطلبك من الحاسبة.",
  invalid_offer_trees: "اكتب عدد الزيتونات بالأرقام، من زيتونة وحدة إلى العدد المتوفّر في العرض.",
  // The payment plan the visitor answers on the offer's own form (owner 2026-09-19, «in the form it's missing
  // the payment method like the main form … each offer has its own stuff»). Raised by public.submit_offer_request
  // once supabase/pending/bb_10_offer_payment_plan.sql is applied; until then the offer intake prices every
  // request as cash and none of the six can arrive, so these lines are inert rather than wrong.
  //
  // None of them may say «ارجع للحاسبة»: on an offer page there is no calculator to go back to — the percentage
  // and the duration are chips in this same form, a few centimetres above the button. Each one names the ONE
  // thing to change, because the database raises a different code for each (a plan this offer does not sell, a
  // missing answer, a percentage it does not allow, a duration it does not price, a pair that produces no plan).
  // The three calculator-worded codes below (invalid_down_payment_percent, down_payment_percent_required,
  // duration_required) are NOT reachable from the offer form: app.project_quote_payload answers with a status
  // instead of raising, and submit_offer_request refuses with its own code first. They keep their wording.
  offer_installments_not_offered: "هذا العرض يتباع بالحاضر فقط. اختر الدفع بالحاضر باش تكمّل.",
  offer_down_payment_percent_required: "اختر نسبة التسبقة من النِّسَب المعروضة في هذا العرض.",
  offer_duration_required: "اختر مدة الدفع من المدد المعروضة في هذا العرض.",
  offer_down_payment_percent_not_allowed: "النسبة هذي ما تنجمش تتباع في هذا العرض. اختر وحدة من النِّسَب المعروضة.",
  offer_duration_not_allowed: "المدة هذي ما تنجمش تتباع في هذا العرض. اختر وحدة من المدد المعروضة.",
  offer_plan_unavailable: "ما نجمناش نحسبو التقسيط بهذي الاختيارات. بدّل النسبة ولا المدة ولا اختر الدفع بالحاضر.",
  // The tree inventory (0054): the unit is the olive tree, so these reach both the visitor who asks for trees in
  // the offer form and the staff member who numbers, reserves or releases them in the Back Office.
  below_min_trees:
    "عدد الزيتونات أقلّ من أقلّ عدد يتباع في هذا العرض. زيد العدد حتى للحدّ الأدنى المكتوب تحت الخانة، ولا اختر عرضاً آخر.",
  not_enough_trees:
    "ما عادش فما هذا العدد من الزيتونات المتاحة في هذا العرض — يمكن تحجّزت توّا. حدّث الصفحة، شوف عدد المتاح، ثم أنقص العدد وأعد المحاولة.",
  offer_has_no_trees:
    "هذا العرض ما عندوش عدد زيتونات، فما فماش شنوّة يتولّد. اكتب «عدد الزيتونات» في بطاقة العرض ثم أعد التوليد.",
  trees_taken_below_count:
    "فما زيتونات محجوزة ولا مباعة رقمها أكبر من عدد الزيتونات الجديد، وهاذوما ما يتمسحوش. رجّع «عدد الزيتونات» لعدد يغطّيهم، ولا فكّ الحجز عليهم قبل ما تنقّص العدد.",
  duplicate_tree_code:
    "صيغة رمز الزيتونة تعطي رموزاً مستعملة من قبل في هذا العرض. بدّل «صيغة رمز الزيتونة» في بطاقة العرض (لازم تكون فيها {seq}) ثم أعد التوليد.",
  invalid_tree_state:
    "حالة الزيتونة موش صحيحة: اختر «متاحة» ولا «محجوزة» ولا «مباعة». والحجز ولا البيع يحبّ زيتونة مربوطة بحريف.",
  invalid_tree_selection:
    "اختيار الزيتونات موش صحيح: اختر من زيتونة وحدة إلى 1000 زيتونة موجودة. حدّث الصفحة وأعد الاختيار.",
  invalid_person:
    "هذا الحريف ما عادش موجود ولا تأرشف. حدّث الصفحة واختر حريفاً آخر، ولا رجّعه من الأرشيف قبل ما تحجز عليه.",
  invalid_request:
    "هذا المطلب موش متاع نفس الحريف ولا موش متاع هذا العرض. اختر مطلباً متاع الحريف في نفس العرض، ولا احجز بلا مطلب.",
  // Raised by every module-gated RPC (app.module_open) when its flag is «معطّل». It is a BUSINESS refusal, so
  // it may never fall through to FALLBACK, which blames the connection for a rule the owner set on purpose.
  // Deliberately module-neutral: one code, many modules, and errors.ts is keyed by the code alone. A module
  // that can name itself says so in its own map — RESERVATION_MESSAGES.module_closed is consulted first and
  // names «العربون والحجز» — and this line answers the rest (today: المطابقة).
  module_closed:
    "هذا الموديول مازال معطّل، فالعملية هذي موقّفة. شغّلو من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم الفريق برك، ولا «منشور للعموم» كي تكون جاهز.",
};

const FALLBACK = "تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة أخرى.";

export function intakeErrorMessage(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || FALLBACK;
}

export function isKnownIntakeError(code: string | undefined | null): boolean {
  return Boolean(code && code in MESSAGES);
}
