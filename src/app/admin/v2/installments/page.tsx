import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { FILTER_LABELS, INSTALLMENT_FILTERS, parseFilter } from "@/lib/backoffice/installments/model";
import { readInstallments } from "@/lib/backoffice/installments/rpc";
import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الأقساط" };

/**
 * الأقساط — the finance queue: which line, whose, and how late.
 *
 * NOT ONE FIGURE HERE IS ADDED UP IN THIS FILE. app.contract_money decides what a line owes, what arrived
 * against it and whether the grace period has passed; staff_installments picks the lines worth a human's
 * attention and orders them. Money computed twice disagrees with itself the first time a payment is voided.
 *
 * THE COUNT SITS ON THE FILTER ITSELF, so «متأخرة ٣» is readable without pressing it — the one number a
 * finance screen is opened for should not require a navigation to see.
 */
export default async function InstallmentsPage({ searchParams }: PageProps<"/admin/v2/installments">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const filter = parseFilter(typeof params.filter === "string" ? params.filter : undefined);
  const list = await readInstallments(supabase, filter, { limit: 100 });

  const empty =
    list === null
      ? "تعذّر جلب الأقساط."
      : list.moduleState === "disabled"
        ? "وحدة الأقساط مطفية. شعّلها من الإعدادات."
        : list.rows.length === 0
          ? "ما فماش أقساط هوني."
          : undefined;

  return (
    <Screen title="الأقساط" count={list?.rows.length ?? null}>
      <Filters>
        {INSTALLMENT_FILTERS.map((key) => (
          <Filter key={key} href={`/admin/v2/installments?filter=${key}`} active={filter === key}>
            {FILTER_LABELS[key]}
            {list ? <span className="ms-1 tabular-nums opacity-60">{formatCount(list.counts[key])}</span> : null}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {list?.rows.map((row) => (
          <Row
            key={row.installment.id}
            href={`/admin/v2/contracts/${row.contractId}`}
            title={row.personName ?? "بلا اسم"}
            subtitle={row.contractNo}
            middle={`قسط ${formatCount(row.installment.seq)}`}
            middleSub={formatDate(row.installment.dueOn)}
            end={formatMillimes(row.installment.leftMillimes || row.installment.amountMillimes)}
            endSub={
              row.installment.isLate && row.installment.daysLate
                ? `متأخر ${formatCount(row.installment.daysLate)} يوم`
                : row.installment.statusLabel
            }
            tone={row.installment.isLate ? "danger" : undefined}
          />
        ))}
      </Rows>
    </Screen>
  );
}
