import { formatArea, formatCount, formatDate, formatMillimes } from "@/lib/format";

import { PAYMENT_MODE_LABELS, REQUEST_KIND_LABELS } from "@/lib/backoffice/leads/filters";

export type RequestDetails = {
  id: string;
  request_no: string;
  created_at: string;
  request_kind: string | null;
  project_name: string | null;
  offer_trees: number | null;
  tree_count_label_ar: string | null;
  desired_area_label_ar: string | null;
  spacing_label_ar: string | null;
  area_per_tree_m2: number | null;
  total_area_m2: number | null;
  payment_mode: string | null;
  total_price_millimes: number | null;
  down_payment_percent: number | null;
  down_payment_amount_millimes: number | null;
  monthly_millimes: number | null;
  duration_label_ar: string | null;
  duration_months: number | null;
  budget_label_ar: string | null;
  priority_label_ar: string | null;
  goal_label_ar: string | null;
  down_payment_label_ar: string | null;
  installment_label_ar: string | null;
  wants_visit: boolean | null;
  wants_bank_financing: boolean | null;
  contact_channel: string | null;
  contact_time_label_ar: string | null;
  residence_governorate_id: number | null;
  invest_governorate_ids: number[] | null;
  invest_anywhere: boolean | null;
  scenario_labels: string[] | null;
};

const CHANNELS: Record<string, string> = {
  phone: "تلفون",
  whatsapp: "واتساب",
  email: "إيميل",
};

/**
 * الطلب — what the client actually answered, on the file, in one box.
 *
 * THIS IS THE SCREEN'S REASON TO EXIST. The file used to print a request number and a date: everything the
 * person typed — how many trees, what spacing, cash or instalments, what he can pay a month, when he wants
 * to be called — was in the row and on no screen (owner, 2026-09-23: «I am not getting the form details the
 * client filled, which is a big problem»). A commercial phoning a lead had to guess, or open v1 and read a
 * table of sixty columns.
 *
 * EVERY VALUE HERE IS A SNAPSHOT THE INTAKE WROTE, never a figure recomputed now. `tree_count_label_ar`,
 * `spacing_label_ar`, the prices, the percentage — public.interest_requests keeps the words and the amounts
 * as they stood the day the form was sent, so an offer repriced next week cannot rewrite what this client
 * was quoted. The card prints them and nothing else.
 *
 * A ROW WITH NO ANSWER IS NOT DRAWN. An offer request answers eight of these fields and a calculator request
 * answers twenty; printing «—» for the rest would turn a short, readable box into a long one made mostly of
 * dashes, which is exactly the «too much, hard to read» the owner asked to be rid of.
 */
export function RequestCard({
  request,
  governorates,
}: {
  request: RequestDetails;
  governorates: Map<number, string>;
}) {
  const yesNo = (value: boolean | null) => (value === null ? null : value ? "إي" : "لا");
  const months = request.duration_months;

  const investing = request.invest_anywhere
    ? "أي ولاية"
    : (request.invest_governorate_ids ?? [])
        .map((id) => governorates.get(id))
        .filter(Boolean)
        .join("، ") || null;

  const rows: Array<[string, string | null]> = [
    ["العرض", request.project_name],
    ["عدد الزيتونات", request.tree_count_label_ar ?? (request.offer_trees ? `${formatCount(request.offer_trees)} زيتونة` : null)],
    ["المساحة لكل زيتونة", request.spacing_label_ar ?? (request.area_per_tree_m2 ? formatArea(request.area_per_tree_m2) : null)],
    ["المساحة الجملية", request.total_area_m2 ? formatArea(request.total_area_m2) : null],
    ["المساحة اللي يحبها", request.desired_area_label_ar],
    ["نوع المشروع", (request.scenario_labels ?? []).join("، ") || null],
    ["طريقة الدفع", request.payment_mode ? (PAYMENT_MODE_LABELS[request.payment_mode] ?? request.payment_mode) : null],
    ["السعر الجملي", request.total_price_millimes ? formatMillimes(request.total_price_millimes) : null],
    [
      "التسبقة",
      request.down_payment_amount_millimes
        ? `${request.down_payment_percent ? `${request.down_payment_percent}% · ` : ""}${formatMillimes(request.down_payment_amount_millimes)}`
        : request.down_payment_label_ar,
    ],
    ["القسط الشهري", request.monthly_millimes ? formatMillimes(request.monthly_millimes) : request.installment_label_ar],
    ["مدة الدفع", request.duration_label_ar ?? (months ? `${formatCount(months)} شهر` : null)],
    ["الميزانية", request.budget_label_ar],
    ["الأولوية", request.priority_label_ar],
    ["الهدف", request.goal_label_ar],
    ["يحب زيارة", yesNo(request.wants_visit)],
    ["تمويل بنكي", yesNo(request.wants_bank_financing)],
    ["وقت الاتصال", request.contact_time_label_ar],
    ["يحب نتصلو بيه بـ", request.contact_channel ? (CHANNELS[request.contact_channel] ?? request.contact_channel) : null],
    ["ولاية الإقامة", request.residence_governorate_id ? (governorates.get(request.residence_governorate_id) ?? null) : null],
    ["يحب يستثمر في", investing],
  ];

  const answered = rows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-4 py-2.5">
        <span dir="ltr" className="text-sm font-semibold text-ink">
          {request.request_no}
        </span>
        {request.request_kind ? (
          <span className="pill">
            {REQUEST_KIND_LABELS[request.request_kind as keyof typeof REQUEST_KIND_LABELS] ?? request.request_kind}
          </span>
        ) : null}
        <span className="ms-auto text-xs text-muted">{formatDate(request.created_at)}</span>
      </header>

      {answered.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">الطلب ما فيه تفاصيل.</p>
      ) : (
        <dl className="grid gap-x-6 px-4 py-3 sm:grid-cols-2">
          {answered.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
              <dt className="shrink-0 text-xs text-muted">{label}</dt>
              <dd className="min-w-0 text-end text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
