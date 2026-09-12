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
  invalid_contact_time: "اختر الوقت المفضل من القائمة.",
  contact_channel_required: "اختر كيف تحب نتصلوا بيك.",
  rate_limited: "وصلنا عدد كبير من الطلبات من نفس المصدر. حاول مرة أخرى بعد ساعة.",
  invalid_area: "اكتب المساحة بالأرقام واختر الوحدة (هكتار أو م²).",
  invalid_tree_count: "اكتب عدد الزيتونات بالأرقام.",
  invalid_price: "اكتب السعر المطلوب بالأرقام، أو اتركه فارغاً.",
  invalid_property_type: "اختر نوع العقار من القائمة.",
  invalid_tree_age: "اختر عمر الأشجار من القائمة.",
  invalid_choice: "أحد الاختيارات غير صحيح. أعد الاختيار من القائمة.",
};

const FALLBACK = "تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة أخرى.";

export function intakeErrorMessage(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || FALLBACK;
}

export function isKnownIntakeError(code: string | undefined | null): boolean {
  return Boolean(code && code in MESSAGES);
}
