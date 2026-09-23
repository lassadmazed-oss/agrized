import type { Metadata } from "next";

import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readReservations } from "@/lib/backoffice/reservations/read";
import {
  daysLeftLabel,
  FILTER_LABELS,
  parseFilter,
  RESERVATION_FILTERS,
} from "@/lib/backoffice/reservations/model";
import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الحجوزات" };

/** One page of the list, the same cap the other v2 lists ask for. */
const PAGE = 100;

/**
 * الحجوزات — every hold on trees, and what each one is waiting for.
 *
 * WHO MAY READ IT. This lists client names, reference numbers and what each one still owes, so the gate is
 * CRM_READ_ROLES — the same list the v1 screen reading the same rows asks for, and the same one
 * createReservation asks for. The database will not do it for us: staff_reservations checks app.is_staff() and
 * app.can_see_person only, which is why the agricultural manager, who has no business in a client file, would
 * otherwise read one here after being turned away from /admin/reservations.
 *
 * THE COUNT SITS ON EACH FILTER, the way الأقساط does it. staff_reservations already counts all seven groups
 * in the same call, so «انتهت مدّتها ٣» is readable without pressing anything — and the one number this
 * screen is opened for is exactly that one.
 *
 * THE HEAD COUNTS WHAT IS ON THE SCREEN, and says so when that is not everything. The head number and the
 * active chip's number describe the same set by two different rules — rows listed, rows matched — and with 240
 * open holds they read «الحجوزات ١٠٠» above «المفتوحة ٢٤٠» with nothing saying which is which. So when the RPC
 * reports `capped`, the head's own line carries «أوّل ١٠٠ من ٢٤٠», the words الملفات already uses for the same
 * cap. It costs no row, and it sits on the line whose number it is correcting.
 *
 * «قربت تنتهي» ALSO SAYS WHAT SOON IS, but only while that filter is the one selected. The window is
 * settings reservations.expiry_soon_days and the RPC returns it (`soonDays`); a filter named after a number
 * nobody prints is a filter a reader has to take on trust.
 *
 * WHAT THE END COLUMN LEADS WITH. A hold's one urgent figure is what is still owed on the deposit — but only
 * while the hold is alive. On an expired or cancelled hold `depositLeftMillimes` is still a positive number,
 * because it is due minus paid and nobody voided the due; printing it there would invoice a dead
 * reservation. So money leads only when `isOpen`, and otherwise the status does. Nothing is lost by dropping
 * the status from a money row: a hold that is open and still owes is, by definition, في انتظار العربون.
 *
 * THE SECOND LINE IS THE DEADLINE, not the word «عربون». A label repeated identically on forty rows carries
 * no information; «فاتت المدة بـ٣ يوم» is the thing that decides whether anyone picks up the phone today, and
 * §24 already worked the number out in SQL. Closed holds have no deadline left to report, so they show the
 * day they closed instead.
 *
 * TWO NUMBERS PER ROW, NOT ONE. `treesCount` is what the reservation took; `treesHeld` is what public.trees
 * says it holds this second. They agree until a tree is freed elsewhere, and on the day they disagree a list
 * printing one of them is lying with a straight face. Both are shown, and only when they differ.
 *
 * A DISABLED MODULE IS A LINE ABOVE THE LIST, NEVER INSTEAD OF IT. staff_reservations carries no module gate
 * on purpose — the flag governs visitors, not the team — and the seeded state of `reservations` is `disabled`,
 * which is exactly the state the Back Office exists to work in: a module is prepared here before it is
 * published. Turning the returned rows into «الوحدة مطفية» hid every hold on a stock database while v1 listed
 * them all. What the flag does close is the five writes (app.assert_reservations_open), so the notice names
 * them rather than the reading, and `empty` is kept for the one thing it means: no rows matched.
 *
 * WHERE THE ACTS ARE. §24's three answers to an expired hold — مدّد · سكّر · رجّع الزيتونات — are popups at
 * the top of the row's destination (ReservationActs), one tap from the queue. They are not on the row itself
 * because `Row`'s whole body is the link: a button inside it is a button inside an <a>, and hanging one beside
 * it needs `Row` to gain an `action` slot in ../ui.tsx, which is outside this change.
 */
export default async function ReservationsPage({ searchParams }: PageProps<"/admin/v2/reservations">) {
  await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();
  const params = await searchParams;

  const filter = parseFilter(typeof params.filter === "string" ? params.filter : undefined);
  const list = await readReservations(supabase, filter, { limit: PAGE });

  const off = list !== null && list.moduleState === "disabled";

  // Only two things make this list empty: the read failed, or nothing matched. A module that is off is
  // neither — its rows came back in full.
  const empty =
    list === null
      ? "تعذّر جلب الحجوزات."
      : list.rows.length > 0
        ? undefined
        : filter === "all"
          ? "ما فماش حجوزات بعد."
          : `ما فماش حجوزات في «${FILTER_LABELS[filter]}».`;

  // The head's own line: what «قربت» means today, and how much of the match is actually listed.
  const notes = [
    filter === "soon" && list !== null && list.soonDays > 0
      ? `«قربت» = ${formatCount(list.soonDays)} يوم ولا أقل`
      : null,
    list?.capped ? `أوّل ${formatCount(list.rows.length)} من ${formatCount(list.matched)}` : null,
  ].filter((note): note is string => note !== null);

  return (
    <Screen
      title="الحجوزات"
      count={list?.rows.length ?? null}
      action={
        notes.length > 0 ? (
          <span className="block text-[0.6875rem] leading-tight text-muted">{notes.join(" · ")}</span>
        ) : undefined
      }
    >
      <Filters>
        {RESERVATION_FILTERS.map((key) => (
          <Filter key={key} href={`/admin/v2/reservations?filter=${key}`} active={filter === key}>
            {FILTER_LABELS[key]}
            {list ? <span className="ms-1 tabular-nums opacity-60">{formatCount(list.counts[key])}</span> : null}
          </Filter>
        ))}
      </Filters>

      {off ? (
        <p className="text-[0.6875rem] leading-tight text-muted">
          <span className="font-semibold text-danger">الوحدة مطفية</span> — الحجوزات هاذي تتقرا كيما هي، أما
          الحجز الجديد، تسجيل العربون، التمديد والتسكير كلّهم مرفوضين. شعّلها من الإعدادات ← الموديولات.
        </p>
      ) : null}

      <Rows empty={empty}>
        {list?.rows.map((row) => {
          const owed = row.isOpen && row.depositLeftMillimes > 0;
          const deadline = row.isOpen ? daysLeftLabel(row.daysLeft, row.expiresAt) : null;
          const trees = `${formatCount(row.treesHeld)} زيتونة${
            row.treesHeld !== row.treesCount ? ` (تسجّلت ${formatCount(row.treesCount)})` : ""
          }`;

          return (
            <Row
              key={row.id}
              href={`/admin/v2/reservations/${row.id}`}
              title={row.personName ?? "بلا اسم"}
              subtitle={row.referenceNo}
              // No «—» here: an offer nobody named lets the tree count take the top line instead of
              // holding a dash where a name should be.
              middle={row.offerName ?? trees}
              middleSub={row.offerName ? trees : undefined}
              end={owed ? formatMillimes(row.depositLeftMillimes) : row.statusLabel}
              endSub={deadline ?? (row.closedAt ? formatDate(row.closedAt) : undefined)}
              tone={row.isOverdue ? "danger" : undefined}
            />
          );
        })}
      </Rows>
    </Screen>
  );
}
