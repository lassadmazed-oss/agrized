import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CONTRACT_FILTERS, FILTER_LABELS, parseFilter } from "@/lib/backoffice/contracts/model";
import { readContracts } from "@/lib/backoffice/contracts/read";
import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "العقود" };

/**
 * العقود — every sale that has a paper behind it.
 *
 * «ما تمضاوش» IS THE FILTER THAT MATTERS, and it is why this list exists apart from الأقساط. A contract
 * written and left unsigned has no schedule — staff_generate_schedule refuses a draft — so it appears in no
 * finance queue however much is owed on it. It is the one state where money is invisible, and this is the
 * only screen it surfaces on.
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
    <Screen title="العقود" count={list?.matched ?? null}>
      <Filters>
        {CONTRACT_FILTERS.map((key) => (
          <Filter key={key} href={`/admin/v2/contracts?filter=${key}`} active={filter === key}>
            {FILTER_LABELS[key]}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {list?.rows.map((row) => (
          <Row
            key={row.id}
            href={`/admin/v2/contracts/${row.id}`}
            title={row.personName ?? "بلا اسم"}
            subtitle={row.referenceNo}
            middle={row.offerName ?? "—"}
            middleSub={`${row.paymentMode === "cash" ? "بالحاضر" : "بالتقسيط"} · ${formatCount(row.treesCount)} زيتونة`}
            end={row.remainingMillimes ? formatMillimes(row.remainingMillimes) : row.statusLabel}
            endSub={row.remainingMillimes ? "متبقّي" : undefined}
          />
        ))}
      </Rows>
    </Screen>
  );
}
