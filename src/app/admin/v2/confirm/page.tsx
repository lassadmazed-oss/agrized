import type { Metadata } from "next";
import Link from "next/link";

import { readReservations } from "@/lib/backoffice/reservations/read";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CancelSale } from "../cancel-sale";
import { Screen } from "../ui";

import { ConfirmForm, type Option } from "./confirm-form";

export const metadata: Metadata = { title: "التأكيد" };

/**
 * التأكيد — the second of the three screens (owner, 2026-09-23: «the second page called the confirmation page,
 * this one I get the sales I made; when I open it I see the details; in this page I type the rest to continue
 * the sale … and we add the payment type, either installments or بالحاضر»).
 *
 * WHAT IT IS A LIST OF. Sales that exist and are not finished: trees are held, maybe a عربون was taken, and
 * nobody has yet said how the client will pay. That set is «reservations without a contract» — so the contracts
 * table is read once and used to subtract, rather than each row asking.
 *
 * WHY FINISHING IS ONE PRESS. The arrangement, the signature and the payment schedule used to be three acts on
 * two screens; a contract could sit signed with no schedule and appear in no finance queue — invisible debt.
 * «أكّد البيعة» does all three in order and stops at the first refusal, so a sale is either on the الأقساط page
 * or still on this one. There is no state in between for someone to forget.
 *
 * A SALE WITH NO IDENTITY CARD CANNOT BE FINISHED, and the row says so with a link to fix it, because the
 * contract names its buyer by CIN and a paper nobody can match to a person is worse than a delay.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/admin/v2/confirm">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;
  const justSold = typeof params.sale === "string" ? params.sale : "";

  const [list, { data: contractRows }, { data: kinds }, { data: methods }] = await Promise.all([
    readReservations(supabase, "open", { limit: 200 }),
    supabase.from("contracts").select("id, reservation_id, reference_no, status"),
    supabase.from("option_items").select("id, label_ar").eq("list_key", "contract_kind").eq("is_active", true).order("sort_order"),
    supabase.from("option_items").select("id, label_ar").eq("list_key", "payment_method").eq("is_active", true).order("sort_order"),
  ]);

  const contracts = new Map(
    (contractRows ?? []).map((row) => [row.reservation_id as string, row] as const),
  );

  const reservations = list?.rows ?? [];
  const waiting = reservations.filter((row) => !contracts.has(row.id));
  const done = reservations.filter((row) => contracts.has(row.id));

  // The identity card decides whether a row can be finished at all, and it lives on the person.
  const { data: people } = await supabase
    .from("persons")
    .select("id, cin")
    .in("id", waiting.length > 0 ? waiting.map((row) => row.personId) : ["00000000-0000-0000-0000-000000000000"]);
  const cins = new Map((people ?? []).map((row) => [row.id, row.cin as string | null] as const));

  const kindOptions = (kinds ?? []) as Option[];
  const methodOptions = (methods ?? []) as Option[];

  return (
    <Screen
      title="التأكيد"
      count={waiting.length}
      action={
        <Link href="/admin/v2/sell" className="btn btn-primary btn-sm">
          بيعة جديدة
        </Link>
      }
    >
      {list?.moduleState === "disabled" ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          موديول «العربون والحجز» معطّل، فالبيعات ما تبانش. شغّلو من الإعدادات ← الموديولات.
        </p>
      ) : null}

      {waiting.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          ما فماش بيعة تستنّى التأكيد. كل البيعات اللي عملتها تأكّدت.
        </p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {waiting.map((row) => {
            const owes = row.depositDueMillimes > 0 && row.depositLeftMillimes > 0;
            const cin = cins.get(row.personId) ?? null;
            const fresh = row.id === justSold;

            return (
              <li
                key={row.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto] ${
                  fresh ? "bg-leaf-soft/40" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {row.personName ?? "بلا اسم"}
                  </span>
                  <span dir="ltr" className="block truncate text-end text-[0.6875rem] leading-tight text-muted">
                    {row.referenceNo}
                  </span>
                </span>

                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-[0.6875rem] leading-tight text-ink">
                    {row.offerName ?? "عرض"} · {formatCount(row.treesHeld)} زيتونة
                  </span>
                  {row.firstCode ? (
                    <span dir="ltr" className="block truncate text-[0.6875rem] leading-tight text-muted">
                      {row.firstCode}
                      {row.lastCode && row.lastCode !== row.firstCode ? ` → ${row.lastCode}` : ""}
                    </span>
                  ) : null}
                </span>

                <span className="text-[0.6875rem] leading-tight tabular-nums">
                  {row.depositDueMillimes > 0 ? (
                    owes ? (
                      <span className="text-gold">
                        عربون {formatMillimes(row.depositLeftMillimes)} باقي
                      </span>
                    ) : (
                      <span className="text-muted">العربون تخلّص</span>
                    )
                  ) : (
                    <span className="text-muted">بلا عربون</span>
                  )}
                  <span className="block text-muted">{formatDate(row.reservedAt)}</span>
                </span>

                <span className="flex items-center gap-1 justify-self-end">
                  {/* Undoing comes before finishing, on the same row: the commonest reason a sale sits here
                      unfinished is that it should not have been made. Its trees are out of stock until it is
                      cancelled, so the control belongs where the stale sale is visible. */}
                  <CancelSale
                    kind="reservation"
                    id={row.id}
                    name={row.personName ?? "بلا اسم"}
                    reference={row.referenceNo}
                  />
                  {cin ? (
                    <ConfirmForm
                      reservationId={row.id}
                      personName={row.personName ?? "بلا اسم"}
                      offerName={row.offerName}
                      trees={row.treesHeld}
                      firstCode={row.firstCode}
                      lastCode={row.lastCode}
                      referenceNo={row.referenceNo}
                      depositMillimes={row.depositDueMillimes}
                      depositLeftMillimes={row.depositLeftMillimes}
                      kinds={kindOptions}
                      methods={methodOptions}
                    />
                  ) : (
                    <Link
                      href={`/admin/v2/requests?person=${row.personId}`}
                      className="text-[0.6875rem] font-semibold text-gold underline"
                    >
                      يلزم بطاقة التعريف
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 ? (
        <section className="space-y-1.5">
          <h2 className="text-[0.6875rem] font-semibold text-muted">بيعات تأكّدت</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {done.slice(0, 20).map((row) => {
              const contract = contracts.get(row.id)!;
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{row.personName ?? "بلا اسم"}</span>
                  <span dir="ltr" className="shrink-0 text-[0.6875rem] text-muted">
                    {contract.reference_no}
                  </span>
                  <Link href="/admin/v2/installments" className="shrink-0 text-[0.6875rem] text-forest hover:underline">
                    الأقساط
                  </Link>
                  {/* A finished sale is cancelled as a CONTRACT — a different act, different words, and a
                      different role in the database. */}
                  <CancelSale
                    kind="contract"
                    id={contract.id}
                    name={row.personName ?? "بلا اسم"}
                    reference={contract.reference_no}
                    label="الغي العقد"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
