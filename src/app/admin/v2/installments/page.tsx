import type { Metadata } from "next";
import Link from "next/link";

import { readInstallments } from "@/lib/backoffice/installments/rpc";
import type { QueueRow } from "@/lib/backoffice/installments/model";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CancelSale } from "../cancel-sale";
import { Screen, Tile, Tiles } from "../ui";

import { Schedule } from "./schedule";

export const metadata: Metadata = { title: "الأقساط" };

/** A client's whole schedule, assembled from the lines the queue returned. */
type ClientPlan = {
  contractId: string;
  contractNo: string;
  personId: string;
  personName: string;
  personPhone: string | null;
  lines: QueueRow["installment"][];
  startOn: string;
  endOn: string;
  paid: number;
  total: number;
  nextDue: QueueRow["installment"] | null;
  leftMillimes: number;
  late: boolean;
  daysLate: number;
};

/**
 * الأقساط — the third screen (owner, 2026-09-23: «in this page I see each client, start date of the
 * instalments and the last instalment date … and I see all the instalments — of course no need to show them
 * all at once, they will be so much … and I can click to paid, and I track the next instalment time, and I
 * get alerted if it got close or passed»).
 *
 * SO A ROW IS A CLIENT, NOT AN INSTALMENT. The queue this reads returns one row per LINE — the right shape for
 * «what does finance have to chase today», the wrong one for «where is this client up to». Twenty-four lines
 * for one client is twenty-four rows of the same name, and the two dates the owner asked for — the first and
 * the last — are not on any single one of them. The lines are grouped here, and each client becomes one row
 * that states its own span.
 *
 * THE LINES ARE FOLDED AWAY, in a <details>, exactly as asked: they are «so much», and nobody reads
 * twenty-four dates to learn that the next one is on the 5th. Opening a client shows the schedule with a
 * «خلّص» on every line that is still owed.
 *
 * THE ALERT IS AT THE TOP AND IT IS A NUMBER. «متأخرة ٣» is a day's work; a coloured dot beside a row is a
 * thing to notice if you happen to scroll past it. Late clients sort first for the same reason — the screen
 * opens on the work, not on the alphabet.
 *
 * WHAT «LATE» MEANS IS THE DATABASE'S TO SAY: `isLate` already counts settings installments.grace_days_after,
 * and «قرّبت» uses the same reminder window the queue filters by, so this screen and the reminders it will one
 * day send can never disagree about which instalment is due.
 */
export default async function InstallmentsPage({ searchParams }: PageProps<"/admin/v2/installments">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;
  const only = typeof params.only === "string" ? params.only : "";

  const [list, { data: methods }] = await Promise.all([
    readInstallments(supabase, "all", { limit: 1000 }),
    supabase
      .from("option_items")
      .select("id, label_ar")
      .eq("list_key", "payment_method")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (!list) {
    return (
      <Screen title="الأقساط">
        <p className="card p-5 text-center text-sm text-muted">تعذّر جلب الأقساط.</p>
      </Screen>
    );
  }

  if (list.moduleState === "disabled") {
    return (
      <Screen title="الأقساط">
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          موديول «الأقساط» معطّل. شغّلو من الإعدادات ← الموديولات.
        </p>
      </Screen>
    );
  }

  // ——— one row per client, built out of the lines
  const byContract = new Map<string, ClientPlan>();
  for (const row of list.rows) {
    const plan = byContract.get(row.contractId);
    if (plan) {
      plan.lines.push(row.installment);
      continue;
    }
    byContract.set(row.contractId, {
      contractId: row.contractId,
      contractNo: row.contractNo,
      personId: row.personId,
      personName: row.personName ?? "بلا اسم",
      personPhone: row.personPhone,
      lines: [row.installment],
      startOn: "",
      endOn: "",
      paid: 0,
      total: 0,
      nextDue: null,
      leftMillimes: 0,
      late: false,
      daysLate: 0,
    });
  }

  const plans = [...byContract.values()].map((plan) => {
    plan.lines.sort((a, b) => a.seq - b.seq);
    const owed = plan.lines.filter((line) => line.leftMillimes > 0);
    const lateLines = plan.lines.filter((line) => line.isLate && line.leftMillimes > 0);

    plan.startOn = plan.lines[0]?.dueOn ?? "";
    plan.endOn = plan.lines[plan.lines.length - 1]?.dueOn ?? "";
    plan.total = plan.lines.length;
    plan.paid = plan.total - owed.length;
    plan.nextDue = owed[0] ?? null;
    plan.leftMillimes = owed.reduce((sum, line) => sum + line.leftMillimes, 0);
    plan.late = lateLines.length > 0;
    plan.daysLate = lateLines.reduce((worst, line) => Math.max(worst, line.daysLate ?? 0), 0);
    return plan;
  });

  /** Due within the reminder window the database keeps, and not late yet. */
  const soon = (plan: ClientPlan) => {
    if (plan.late || !plan.nextDue) return false;
    const days = Math.ceil((Date.parse(plan.nextDue.dueOn) - Date.now()) / 86_400_000);
    return days >= 0 && days <= list.reminderDays;
  };

  const lateCount = plans.filter((plan) => plan.late).length;
  const soonCount = plans.filter(soon).length;
  const doneCount = plans.filter((plan) => plan.leftMillimes <= 0).length;

  const shown = plans
    .filter((plan) =>
      only === "late" ? plan.late : only === "soon" ? soon(plan) : only === "done" ? plan.leftMillimes <= 0 : true,
    )
    // The work first: latest-late, then nearest-due, then the settled ones.
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      if (a.late && b.late) return b.daysLate - a.daysLate;
      if (!a.nextDue && !b.nextDue) return a.personName.localeCompare(b.personName, "ar");
      if (!a.nextDue) return 1;
      if (!b.nextDue) return -1;
      return a.nextDue.dueOn.localeCompare(b.nextDue.dueOn);
    });

  return (
    <Screen title="الأقساط" count={plans.length}>
      <Tiles>
        <Tile label="متأخرة" value={formatCount(lateCount)} tone={lateCount > 0 ? "danger" : undefined} note="فات وقتها" />
        <Tile label="قرّبت" value={formatCount(soonCount)} note={`في ${formatCount(list.reminderDays)} أيام الجاية`} />
        <Tile label="كمّلت" value={formatCount(doneCount)} note="ما بقا عليهم شي" />
      </Tiles>

      <div className="rail-none -mx-1 flex gap-1 overflow-x-auto px-1">
        {(
          [
            ["", "الكل", plans.length],
            ["late", "متأخرة", lateCount],
            ["soon", "قرّبت", soonCount],
            ["done", "كمّلت", doneCount],
          ] as const
        ).map(([value, label, n]) => (
          <Link
            key={label}
            href={value ? `/admin/v2/installments?only=${value}` : "/admin/v2/installments"}
            aria-current={only === value ? "page" : undefined}
            className={`shrink-0 rounded-lg border px-2 py-1 text-[0.6875rem] font-semibold transition-colors ${
              only === value
                ? "border-forest/25 bg-leaf-soft text-forest"
                : "border-transparent text-muted hover:bg-paper hover:text-forest"
            }`}
          >
            {label}
            <span className="ms-1 font-normal tabular-nums">{formatCount(n)}</span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="card p-5 text-center text-sm text-muted">
          {plans.length === 0 ? "ما فماش جدول أقساط بعد. أكّد بيعة بالتقسيط وجدولها يبان هوني." : "ما فماش حريف في هالفلترة."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((plan) => (
            <li key={plan.contractId} className="card overflow-hidden">
              <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 transition-colors hover:bg-paper sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]">
                  <span
                    aria-hidden
                    className="text-[0.625rem] text-muted transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{plan.personName}</span>
                    <span dir="ltr" className="block truncate text-end text-[0.6875rem] leading-tight text-muted">
                      {plan.contractNo}
                    </span>
                  </span>

                  {/* The two dates the owner asked for, side by side. */}
                  <span className="hidden text-[0.6875rem] leading-tight text-muted tabular-nums sm:block">
                    <span className="block">
                      من {formatDate(plan.startOn)} لـ {formatDate(plan.endOn)}
                    </span>
                    <span className="block">
                      خلّص {formatCount(plan.paid)} من {formatCount(plan.total)}
                      {plan.leftMillimes > 0 ? ` · باقي ${formatMillimes(plan.leftMillimes)}` : ""}
                    </span>
                  </span>

                  <span className="text-[0.6875rem] leading-tight tabular-nums">
                    {plan.nextDue ? (
                      <>
                        <span className="block text-muted">القسط الجاي</span>
                        <span className={`block font-semibold ${plan.late ? "text-danger" : "text-ink"}`}>
                          {formatDate(plan.nextDue.dueOn)} · {formatMillimes(plan.nextDue.leftMillimes)}
                        </span>
                      </>
                    ) : (
                      <span className="block text-muted">كمّل</span>
                    )}
                  </span>

                  <span className="justify-self-end">
                    <span
                      className={`inline-block rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold ${
                        plan.late
                          ? "border-danger/40 text-danger"
                          : !plan.nextDue
                            ? "border-forest/25 bg-leaf-soft text-forest"
                            : soon(plan)
                              ? "border-gold/45 bg-gold-soft/45 text-gold"
                              : "border-line text-muted"
                      }`}
                    >
                      {plan.late
                        ? `متأخر ${formatCount(plan.daysLate)} يوم`
                        : !plan.nextDue
                          ? "كمّل"
                          : soon(plan)
                            ? "قرّب"
                            : "سليم"}
                    </span>
                  </span>
                </summary>

                <div className="border-t border-line px-3 pb-3 pt-2">
                  <Schedule
                    contractId={plan.contractId}
                    lines={plan.lines.map((line) => ({
                      id: line.id,
                      seq: line.seq,
                      dueOn: line.dueOn,
                      amountMillimes: line.amountMillimes,
                      paidMillimes: line.paidMillimes,
                      leftMillimes: line.leftMillimes,
                      statusLabel: line.statusLabel,
                      isLate: line.isLate,
                      daysLate: line.daysLate,
                    }))}
                    methods={(methods ?? []).map((row) => ({ id: row.id, label: row.label_ar }))}
                  />

                  {/* Cancelling lives at the BOTTOM of an opened client, never on the row: a collections
                      screen is scrolled fast, and an irreversible act must not sit a thumb-width from the
                      «سجّل» that records a payment. */}
                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-2">
                    <span className="text-[0.6875rem] text-muted">الحريف ما عادش باش يكمّل؟</span>
                    <CancelSale
                      kind="contract"
                      id={plan.contractId}
                      name={plan.personName}
                      reference={plan.contractNo}
                      label="الغي العقد"
                    />
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {list.capped ? (
        <p className="text-center text-[0.6875rem] text-muted">
          باينين أوّل {formatCount(list.limit)} قسط. كان الجداول كثروا، الفلترة تنقّص المعروض.
        </p>
      ) : null}
    </Screen>
  );
}
