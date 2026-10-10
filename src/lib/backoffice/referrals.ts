// The Back Office's view of the parrainage (0136): the shapes the staff_referral_* functions answer, and the
// Arabic of each state. Every figure arrives computed from Postgres; nothing here adds anything up.

export const COMMISSION_STATUSES = ["pending", "validated", "paid", "cancelled", "reversed"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: "في الانتظار",
  validated: "مؤكّدة، تستنّى الخلاص",
  paid: "مخلّصة",
  cancelled: "ملغاة",
  reversed: "تخلّصت والبيع تلغى",
};

export const COMMISSION_STATUS_NOTES: Record<CommissionStatus, string> = {
  pending: "البيع موجود وما تخلّصش بالكامل.",
  validated: "البيع تخلّص بالكامل: الكوميسيون واجبة، تستنّى موافقتكم على الخلاص.",
  paid: "دخلت في خلاص مسجّل.",
  cancelled: "البيع تلغى، ولا واحد من الفريق وقّفها، قبل ما تتخلّص.",
  reversed: "تخلّصت ومن بعد البيع تلغى: المبلغ يلزم يرجع لـAgriZed.",
};

export function isCommissionStatus(value: unknown): value is CommissionStatus {
  return typeof value === "string" && (COMMISSION_STATUSES as readonly string[]).includes(value);
}

export const BASIS_LABELS = { tree: "على كل زيتونة", order: "على كل طلبية" } as const;

export type ReferralPerson = {
  id: string;
  full_name: string;
  phone_e164: string;
  referral_code: string | null;
  archived: boolean;
};

export type CommissionRule = {
  id: string;
  version: number;
  amounts_millimes: number[];
  basis: "tree" | "order";
  cap_millimes: number;
  min_margin_bp: number;
  note: string | null;
  created_at: string;
  created_by?: string | null;
};

export type ReferralOverview = {
  flag: "disabled" | "internal" | "public";
  rule: CommissionRule | null;
  rules: CommissionRule[];
  totals: Partial<Record<CommissionStatus, { count: number; millimes: number }>>;
  months: { month: string; created_millimes: number; validated_millimes: number | null; paid_millimes: number | null }[];
  referred_people: number;
  offers: { id: string; code: string; name: string; status: string; referral_enabled: boolean }[];
  to_pay: { person: ReferralPerson; validated_millimes: number; count: number; ids: string[] }[];
  top: { person: ReferralPerson; direct: number; earned_millimes: number }[];
};

export type CommissionRow = {
  id: string;
  status: CommissionStatus;
  generation: number;
  basis: "tree" | "order";
  units: number;
  unit_millimes: number;
  rule_unit_millimes: number;
  amount_millimes: number;
  price_per_tree_millimes: number;
  cost_per_tree_millimes: number | null;
  rule_id: string;
  created_at: string;
  validated_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  reversed_at: string | null;
  cancel_reason: string | null;
  beneficiary: ReferralPerson;
  buyer: ReferralPerson;
  contract: { id: string; reference_no: string; status: string; trees_count: number };
  project: { id: string; code: string; name: string };
  payout: { id: string; reference_no: string; paid_on: string } | null;
};

export type PayoutRow = {
  id: string;
  reference_no: string;
  paid_on: string;
  total_millimes: number;
  method_label: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  person: ReferralPerson;
  count: number;
};

export type ReferralAlert = {
  kind: "shared_contact" | "shared_ip" | "burst" | "reversed" | "no_cost";
  referrer: ReferralPerson | null;
  person?: ReferralPerson | null;
  people?: ReferralPerson[];
  detail?: string | null;
  amount_millimes?: number;
  at: string | null;
};

export const ALERT_LABELS: Record<ReferralAlert["kind"], string> = {
  shared_contact: "معطيات مشتركة مع الـParrain",
  shared_ip: "تسجيلات من نفس العنوان",
  burst: "برشا تسجيلات في نهار",
  reversed: "كوميسيون تخلّصت والبيع تلغى",
  no_cost: "الهامش ما تثبّتش (الكلفة مش معروفة)",
};

export type ReferralTree = {
  person: ReferralPerson & { referred_at: string | null; referral_meta: Record<string, unknown> | null };
  depth: number;
  upline: (ReferralPerson & { generation: number })[];
  downline: (ReferralPerson & { generation: number; parent_id: string; referred_at: string | null; contracts: number })[];
  earnings: { pending_millimes: number; validated_millimes: number; paid_millimes: number; reversed_millimes: number };
};

/** The database's refusal → what the team reads, and what to do about it. */
export const REFERRAL_ERRORS: Record<string, string> = {
  forbidden: "ما عندكش الصلاحية لهذه العملية. القاعدة والعروض للإدارة، والخلاص للمالية والإدارة.",
  invalid_commission_amounts: "اكتب مبلغ كل جيل بالدينار، رقم موجب ولا صفر، من جيل واحد حتى 10 أجيال.",
  invalid_commission_basis: "اختار كيفاش تتحسب: على كل زيتونة ولا على كل طلبية.",
  invalid_commission_cap: "اكتب السقف بالدينار، رقم أكبر من صفر، مثال: 200.",
  commission_over_cap: "مجموع مبالغ الأجيال فايت السقف. نقّص المبالغ ولا كبّر السقف.",
  invalid_min_margin: "اكتب أدنى هامش كنسبة بين 0 و100، مثال: 15.",
  project_not_found: "العرض هذا ما عادش موجود. حدّث الصفحة.",
  no_commission_selected: "اختار كوميسيون وحدة على الأقل باش تخلّصها.",
  invalid_paid_on: "تاريخ الخلاص ناقص ولا في المستقبل. اكتب تاريخ اليوم ولا تاريخ قبلو.",
  commission_not_payable: "واحدة من الكوميسيونات تبدّلت حالتها ولا موش متاع الشخص هذا. حدّث الصفحة وعاود.",
  commission_not_cancellable: "الكوميسيون هذي ما عادش تتلغى: تخلّصت ولا تلغات من قبل. حدّث الصفحة.",
  person_not_found: "الحريف هذا ما لقيناهش ولا مؤرشف. ثبّت في الكود وعاود.",
  referral_cycle: "ما ينجمش: الـParrain هذا جاء هو بيدو عن طريق الحريف هذا (دورة).",
  referral_self: "الحريف ما ينجمش يكون Parrain لروحو.",
  reason_required: "اكتب السبب في خانة «السبب» (3 حروف على الأقل)، ومن بعد عاود.",
};

export function referralErrorMessage(code: string | undefined | null): string {
  return (code && REFERRAL_ERRORS[code]) || "ما تسجّل شي. حدّث الصفحة، ثبّت في القيم، وعاود.";
}
