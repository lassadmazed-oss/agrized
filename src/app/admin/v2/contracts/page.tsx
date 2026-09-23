import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  CONTRACT_FILTERS,
  FILTER_LABELS,
  isOpen,
  parseFilter,
  stageIsLate,
  stageWorthShowing,
} from "@/lib/backoffice/contracts/model";
import { readContracts } from "@/lib/backoffice/contracts/read";
import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "العقود" };

/**
 * العقود — every sale that has a paper behind it, ordered by what needs a human today.
 *
 * «ما تمضاوش» IS THE FILTER THAT MATTERS, and it is why this list exists apart from الأقساط. A contract
 * written and left unsigned has no schedule — staff_generate_schedule refuses a draft — so it appears in no
 * finance queue however much is owed on it. It is the one state where money is invisible, and this is the
 * only screen it surfaces on.
 *
 * SO THE UNSIGNED ROW IS GOLD, and its figure is the whole price rather than what is «left». This is the one
 * place the end column changes meaning between rows, and it has to: on a signed contract
 * money.totalLeftMillimes is what is still owed, but on a draft the schedule does not exist, so that same
 * field counts the down payment alone and would print a few thousand millimes against a sixty-thousand-dinar
 * sale. The gold, and the word under the number, say which of the two a reader is looking at — the same gold
 * the contract page puts on the same state, and it sits in the end column, which never collapses on a phone.
 *
 * «بلا جدول» IS THE OTHER HALF OF THAT HOLE: signed, on instalments, and still no schedule because
 * `installments` was off at signature. Invisible to الأقساط for the same reason, so it is gold too.
 *
 * MONEY LEADS ONLY WHILE THE CONTRACT IS OPEN. totalLeftMillimes is due minus paid and knows nothing about a
 * cancellation, so on a ملغى row it is still a positive number — printing it there would invoice a dead
 * contract. A closed row shows its status and the day it closed.
 *
 * THE COUNT SITS ON EVERY FILTER, the way الأقساط does it. staff_contracts counts all seven groups in the same
 * pass that builds the rows, so «فيها تأخير ٣» is readable without pressing anything. The head then counts
 * what is actually on the screen rather than what matched, and «الكل» reading higher than the head is the
 * 100-row cap saying so without a sentence apologising for it.
 *
 * NO «—» ANYWHERE. A contract whose offer nobody named lets the plan line move up into its place instead of
 * holding a dash, and on a contract with a schedule that line is «٤/٣٦ قسط» — which already says بالتقسيط, so
 * the word itself is printed only when there is no schedule to count.
 */
export default async function ContractsPage({ searchParams }: PageProps<"/admin/v2/contracts">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const filter = parseFilter(typeof params.filter === "string" ? params.filter : undefined);
  const list = await readContracts(supabase, filter, { limit: 100 });

  const empty =
    list === null
      ? "تعذّر جلب العقود."
      : list.moduleState === "disabled"
        ? "وحدة العقود مطفية. شعّلها من الإعدادات."
        : list.rows.length === 0
          ? "ما فماش عقود هوني."
          : undefined;

  return (
    <Screen title="العقود" count={list?.rows.length ?? null}>
      <Filters>
        {CONTRACT_FILTERS.map((key) => (
          <Filter key={key} href={`/admin/v2/contracts?filter=${key}`} active={filter === key}>
            {FILTER_LABELS[key]}
            {list ? <span className="ms-1 tabular-nums opacity-60">{formatCount(list.counts[key])}</span> : null}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {list?.rows.map((row) => {
          const open = isOpen(row);
          // contracts_draft_check: a draft has no signature date, and nothing else does.
          const unsigned = row.signedOn === null;
          const noSchedule = row.paymentMode === "installments" && row.money.installmentsCount === 0;
          // The two states الأقساط cannot see. Both are still live money, and both are only visible here.
          const hidden = open && (unsigned || noSchedule);
          const late = stageIsLate(row.money.stage);
          const owed = open && row.money.totalLeftMillimes > 0;

          const plan =
            row.money.installmentsCount > 0
              ? `${formatCount(row.money.installmentsPaidCount)}/${formatCount(row.money.installmentsCount)} قسط`
              : row.paymentMode === "cash"
                ? "بالحاضر"
                : "بالتقسيط";
          const context = `${plan} · ${formatCount(row.treesCount)} زيتونة`;

          return (
            <Row
              key={row.id}
              href={`/admin/v2/contracts/${row.id}`}
              title={row.personName ?? "بلا اسم"}
              subtitle={row.referenceNo}
              middle={row.offerName ?? context}
              middleSub={row.offerName ? context : undefined}
              end={
                hidden ? (
                  <span className="text-gold">{formatMillimes(row.totalPriceMillimes)}</span>
                ) : owed ? (
                  formatMillimes(row.money.totalLeftMillimes)
                ) : (
                  row.statusLabel
                )
              }
              endSub={
                hidden ? (
                  <span className="font-semibold text-gold">{unsigned ? "ما تمضاش" : "بلا جدول"}</span>
                ) : open && stageWorthShowing(row.money.stage) ? (
                  row.money.stageLabel
                ) : open && row.money.nextDueOn ? (
                  `الجاي ${formatDate(row.money.nextDueOn)}`
                ) : owed ? (
                  "الباقي"
                ) : row.settledAt ? (
                  formatDate(row.settledAt)
                ) : row.cancelledAt ? (
                  formatDate(row.cancelledAt)
                ) : undefined
              }
              tone={late ? "danger" : undefined}
            />
          );
        })}
      </Rows>
    </Screen>
  );
}
