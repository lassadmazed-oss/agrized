import type { Metadata } from "next";
import Link from "next/link";

import { REQUEST_KIND_LABELS, type RequestKind } from "@/lib/backoffice/leads/filters";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Screen } from "../ui";

import { RequestFacts, type Governorates, type RequestDetails } from "./request-details";

export const metadata: Metadata = { title: "الطلبات" };

/** Every column RequestFacts prints. The list and the component have to agree, or this stops compiling. */
const COLUMNS =
  "id, person_id, request_no, created_at, request_kind, project_name, project_code, price_per_tree_millimes, " +
  "production_statuses, source, offer_trees, tree_count_label_ar, desired_area_label_ar, spacing_label_ar, " +
  "area_per_tree_m2, total_area_m2, payment_mode, total_price_millimes, down_payment_percent, " +
  "down_payment_amount_millimes, monthly_millimes, duration_label_ar, duration_months, budget_label_ar, " +
  "priority_label_ar, goal_label_ar, down_payment_label_ar, installment_label_ar, wants_visit, " +
  "wants_bank_financing, contact_channel, contact_time_label_ar, residence_governorate_id, " +
  "invest_governorate_ids, invest_anywhere, scenario_labels, person:persons(id, full_name, phone_e164, cin)";

const PAGE = 100;

type Row = RequestDetails & {
  person_id: string;
  person: { id: string; full_name: string | null; phone_e164: string | null; cin: string | null } | null;
};

/**
 * الطلبات — what the forms brought in, and nothing else (owner, 2026-09-24: «the only goal of the start form
 * or any form is to get the client interested in detail … I want a page to receive the form details»).
 *
 * IT IS A LIST OF DEMANDS, NOT OF CLIENTS. One row per thing somebody asked for, newest first, because the
 * question this screen answers is «who wrote in, and what did they say» — and a client who asked twice about
 * two different offers asked two questions, not one.
 *
 * NOTHING HERE SELLS. There is one button, «بيع لهذا», and it goes to صفحة البيع with the client already
 * chosen — it does not reserve a tree or quote a price. Selling has one page, and this is not it.
 *
 * THE ANSWERS ARE ONE PRESS AWAY, not printed on every row: twenty answers × a hundred demands is a document,
 * not a list. A <details> opens the one being read, with no JavaScript and no state to get out of step.
 *
 * AND THE MONEY IN THEM IS QUOTED, NOT STATED — RequestFacts separates the simulator's figures under their own
 * caption, so «9,725 د.ت» on a demand can never be read as a price this company agreed to.
 */
export default async function RequestsPage({ searchParams }: PageProps<"/admin/v2/requests">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const kind = (["calculator", "offer"] as const).find((value) => value === params.kind) ?? "";
  const open = typeof params.open === "string" ? params.open : "";

  // The search is on the PERSON — a name or a number is how anybody looks for a demand. Two queries rather
  // than an embedded filter: PostgREST cannot `or` across an embedded table, and a false «ما فماش» because of
  // that is worse than a second round trip.
  let personIds: string[] | null = null;
  if (q) {
    const digits = q.replace(/[^0-9]/g, "");
    const { data: people } = await supabase
      .from("persons")
      .select("id")
      .or(
        [`full_name.ilike.%${q}%`, digits.length >= 3 ? `phone_e164.ilike.%${digits}%` : null, `cin.ilike.${q}%`]
          .filter(Boolean)
          .join(","),
      )
      .limit(200);
    personIds = (people ?? []).map((row) => row.id);
  }

  let query = supabase
    .from("interest_requests")
    .select(COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (kind) query = query.eq("request_kind", kind);
  if (personIds !== null) {
    query = query.in("person_id", personIds.length > 0 ? personIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const [{ data, count, error }, { data: govRows }] = await Promise.all([
    query,
    supabase.from("governorates").select("id, name_ar"),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const governorates: Governorates = Object.fromEntries(
    (govRows ?? []).map((row) => [String(row.id), row.name_ar] as const),
  );

  const link = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (kind) query.set("kind", kind);
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const text = query.toString();
    return text ? `/admin/v2/requests?${text}` : "/admin/v2/requests";
  };

  return (
    <Screen title="الطلبات" count={count ?? rows.length}>
      <div className="card space-y-2 p-2">
        <form action="/admin/v2/requests" className="flex items-center gap-1.5">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="اسم، تلفون، ولا بطاقة تعريف"
            autoComplete="off"
            aria-label="لوّج في الطلبات"
            className="field field-sm min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-secondary btn-sm shrink-0">
            لوّج
          </button>
          {q || kind ? (
            <Link href="/admin/v2/requests" className="btn btn-ghost btn-sm shrink-0">
              صفّي
            </Link>
          ) : null}
        </form>

        <div className="flex gap-1">
          {(
            [
              ["", "الكل"],
              ["offer", REQUEST_KIND_LABELS.offer],
              ["calculator", REQUEST_KIND_LABELS.calculator],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={label}
              href={link({ kind: value })}
              aria-current={kind === value ? "page" : undefined}
              className={`rounded-lg border px-2 py-1 text-[0.6875rem] font-semibold transition-colors ${
                kind === value
                  ? "border-forest/25 bg-leaf-soft text-forest"
                  : "border-transparent text-muted hover:bg-paper hover:text-forest"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <p className="card p-5 text-center text-sm text-muted">تعذّر جلب الطلبات.</p>
      ) : rows.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          {q || kind ? "ما فماش طلب بهالبحث." : "ما فماش طلبات بعد."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const trees = row.offer_trees
              ? `${formatCount(row.offer_trees)} زيتونة`
              : (row.tree_count_label_ar ?? null);
            const isOpen = open === row.id;

            return (
              <li key={row.id} className="card overflow-hidden">
                <details open={isOpen} className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 transition-colors hover:bg-paper sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]">
                    <span aria-hidden className="text-[0.625rem] text-muted transition-transform group-open:rotate-180">
                      ▾
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {row.person?.full_name ?? "بلا اسم"}
                      </span>
                      {row.person?.phone_e164 ? (
                        <span dir="ltr" className="block truncate text-end text-[0.6875rem] leading-tight text-muted">
                          {row.person.phone_e164}
                        </span>
                      ) : null}
                    </span>

                    <span className="hidden min-w-0 text-[0.6875rem] leading-tight sm:block">
                      <span className="block truncate text-ink">{row.project_name ?? "بلا عرض محدّد"}</span>
                      <span className="block truncate text-muted">
                        {[trees, row.request_kind ? REQUEST_KIND_LABELS[row.request_kind as RequestKind] : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>

                    <span className="text-[0.6875rem] leading-tight text-muted tabular-nums">
                      {formatDate(row.created_at)}
                    </span>

                    {/* The only act on this screen, and it leaves it. */}
                    <Link
                      href={`/admin/v2/sell?person=${row.person_id}`}
                      className="btn btn-secondary btn-sm justify-self-end"
                    >
                      بيع لهذا
                    </Link>
                  </summary>

                  <div className="border-t border-line p-2 sm:p-3">
                    <RequestFacts request={row} governorates={governorates} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {(count ?? 0) > rows.length ? (
        <p className="text-center text-[0.6875rem] text-muted">
          باينين أوّل {formatCount(rows.length)} طلب من {formatCount(count ?? 0)}. لوّج على اسم باش تلقى الباقي.
        </p>
      ) : null}
    </Screen>
  );
}
