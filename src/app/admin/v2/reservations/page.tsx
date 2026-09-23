import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readReservations } from "../../(panel)/reservations/read";
import { FILTER_LABELS, parseFilter, RESERVATION_FILTERS } from "../../(panel)/reservations/reservation-model";
import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الحجوزات" };

/**
 * الحجوزات — every hold on trees, and what each one is waiting for.
 *
 * TWO NUMBERS PER ROW, NOT ONE. `treesCount` is what the reservation took; `treesHeld` is what public.trees
 * says it holds this second. They agree until a tree is freed elsewhere, and on the day they disagree a list
 * printing one of them is lying with a straight face. Both are shown, and only when they differ.
 *
 * A DISABLED MODULE SAYS SO rather than rendering an empty list — «ما فماش حجوزات» is a different and far
 * more comforting sentence than the truth.
 */
export default async function ReservationsPage({ searchParams }: PageProps<"/admin/v2/reservations">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const filter = parseFilter(typeof params.filter === "string" ? params.filter : undefined);
  const list = await readReservations(supabase, filter, { limit: 100 });

  const empty =
    list === null
      ? "تعذّر جلب الحجوزات."
      : list.moduleState === "disabled"
        ? "وحدة الحجوزات مطفية. شعّلها من الإعدادات."
        : list.rows.length === 0
          ? "ما فماش حجوزات هوني."
          : undefined;

  return (
    <Screen title="الحجوزات" count={list?.matched ?? null}>
      <Filters>
        {RESERVATION_FILTERS.map((key) => (
          <Filter key={key} href={`/admin/v2/reservations?filter=${key}`} active={filter === key}>
            {FILTER_LABELS[key]}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {list?.rows.map((row) => (
          <Row
            key={row.id}
            href={`/admin/v2/reservations/${row.id}`}
            title={row.personName ?? "بلا اسم"}
            subtitle={row.referenceNo}
            middle={row.offerName ?? "—"}
            middleSub={`${formatCount(row.treesHeld)} زيتونة${
              row.treesHeld !== row.treesCount ? ` (تسجّلت ${formatCount(row.treesCount)})` : ""
            }`}
            end={row.depositLeftMillimes > 0 ? formatMillimes(row.depositLeftMillimes) : row.statusLabel}
            endSub={row.depositLeftMillimes > 0 ? "باقي من العربون" : undefined}
            tone={row.isOverdue ? "danger" : undefined}
          />
        ))}
      </Rows>
    </Screen>
  );
}
