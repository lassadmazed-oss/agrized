import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readInstallments } from "@/lib/backoffice/installments/rpc";
import { daysAgo, tunisToday } from "@/lib/backoffice/leads/dates";

import { Rows, Screen } from "./ui";

export const metadata: Metadata = { title: "اليوم" };

/**
 * اليوم — one status line, and nothing else.
 *
 * WHAT THIS REPLACED. Five StatTiles at `card p-5`, two-up on a phone: forty pixels of padding and a shadow
 * around every single digit, three rows of tall boxes (~300px) before anything was read, and a 110px band on
 * the wide screen the owner actually works on. The figures were never the problem, the boxes were. Here a
 * count is ONE line — figure, then what it counts — and the five of them live inside a single surface divided
 * by hairlines: ~44px across on a wide screen, ~150px on a phone. The eye runs down a column of numbers
 * instead of hopping between five rectangles, which is what «status line» means and what a tile grid never is.
 *
 * TWO RULES SURVIVE FROM THE OLD SCREEN, because they are the whole reason this board can be trusted. Every
 * figure counts rows that exist, and every figure is a door into the list it counted. A count that could not
 * be read prints «—», never 0: a zero and a failed read look identical on a dashboard and mean opposite
 * things, one «nothing to do», the other «you are flying blind».
 *
 * A CELL NOBODY MAY SEE IS NOT DRAWN AT ALL. Permission is known before the reads, so a commercial gets the
 * counts that are theirs instead of five slots of which two are dashes. The dash is kept for a read that was
 * allowed and still failed — the only case where it tells the reader something.
 *
 * THE ALL-CLEAR IS TESTED OVER EVERY CELL, NOT OVER THE READABLE ONES. Filtering the dashes out first only
 * catches the all-failed case: three zeros beside one «—» would still print «ما فماش حاجة تستنّى فيك.» while
 * the one figure that could be an alarm is exactly the one nobody could read. So a single unread cell
 * disqualifies the line — «nothing is waiting» is a claim about all of it or it is not made.
 *
 * A FIGURE IS RESOLVED THE WAY THE DATABASE RESOLVES IT. «جديد» is a row the owner can rename, retire or
 * reorder, so this screen picks it with the SAME rule that stamps it onto a new person in
 * supabase/migrations/0054_trees.sql:833 — `stage = 'new' and is_active order by is_stage_default desc,
 * sort_order limit 1`. Dropping `is_active` or the ORDER BY would let the board count a status nothing is
 * ever written to and open a door onto a list the destination cannot even draw a chip for.
 *
 * THE DOORS STAY INSIDE THE SPINE where a v2 screen carries the filter the count describes
 * (`files?status_id=`, `reservations?filter=awaiting`, `installments?filter=overdue`). Two cells cross over to
 * v1, because only v1 has the list: «بلا مسؤول» (assignee is a v1-only filter) and «متابعاتي المستحقة».
 *
 * «متابعاتي المستحقة» IS THE READER'S OWN LIST, COUNTED THE WAY THAT LIST COUNTS. It reads
 * contact_attempts with the three narrowings v1's list uses (src/app/admin/(panel)/page.tsx:109) — mine,
 * inside the last thirty days, due by tonight — and then counts PEOPLE, not attempts, because a client with
 * four logged attempts is one call to make and one row on that list. Without the owner filter it was
 * everyone's follow-ups; without the lower bound a date set in 2025 and never cleared counted forever
 * (contact_attempts has no «handled» column); without the dedupe it was structurally larger than the list it
 * describes. This is the one figure on the screen derived in TypeScript, and it is derived only to match.
 *
 * NO POPUP HERE, DELIBERATELY. Nothing on this screen is a form and nothing is stacked; a popup would add a
 * press in front of the single press each cell already is.
 *
 * THE STRIP WANTS TO BE `Strip`/`Cell` IN ui.tsx, beside Tiles/Tile — it is a fifth shape, and the second
 * screen that needs a status line should lift it there rather than copy the grid and the hairline trick.
 */

/** One count: what it counts, the figure, and the list it opens. */
type Cell = {
  label: string;
  /** null means «could not be read». It is not a zero, and it never prints as one. */
  value: number | null;
  href?: string;
  /**
   * A state that qualifies the figure. It is its own line under the label, never trailing text inside it:
   * the label is clipped first on a phone, so anything appended to it is the first thing thrown away.
   */
  note?: string;
  /** A positive figure that is bad news rather than merely pending work. */
  alarm?: boolean;
};

/** How wide the strip runs once there is room. Written out, because Tailwind reads class names off the source
 *  and an empty grid slot in this layout would show as a grey block where a count should be. */
const COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

/** Who has follow-ups of their own: the three roles v1 draws «متابعاتي المستحقة» for. A reader who never
 *  logs an attempt has none, and a cell that reads 0 for them forever is a slot spent saying nothing. */
const FOLLOW_UP_ROLES = ["commercial", ...ADMIN_ROLES] as const;

/** The window and the cap v1's list reads with, so this figure is the length of that list rather than a
 *  bigger number about the same thing. */
const FOLLOW_UP_DAYS = 30;
const FOLLOW_UP_CAP = 100;

export default async function TodayPage() {
  const session = await requireStaff();
  const supabase = await createClient();

  const canSeeCrm = hasRole(session, CRM_READ_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const canSeeMoney = hasRole(session, PRICE_ROLES);
  const canFollowUp = hasRole(session, FOLLOW_UP_ROLES);

  const today = tunisToday();
  const endOfToday = `${today}T23:59:59+01:00`;

  // The «جديد» status is a row the owner can rename or reorder, never a string in the code — and it is picked
  // with the same rule the database stamps it with: active only, the stage default first, then sort_order.
  const { data: statuses } = canSeeCrm
    ? await supabase
        .from("lead_statuses")
        .select("id, is_stage_default, sort_order")
        .eq("stage", "new")
        .eq("is_active", true)
        .order("is_stage_default", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(1)
    : { data: null };
  const newStatusId = statuses?.[0]?.id ?? null;

  const [fresh, unassigned, followUps, awaitingDeposit, installments] = await Promise.all([
    canSeeCrm && newStatusId
      ? supabase.from("persons").select("id", { count: "exact", head: true }).eq("status_id", newStatusId)
      : null,
    isAdmin ? supabase.from("persons").select("id", { count: "exact", head: true }).is("assigned_to", null) : null,
    // The reader's own due follow-ups, read exactly as v1's list reads them — person_id rather than a head
    // count, because the figure is people and the rows have to be collapsed to get there.
    canFollowUp
      ? supabase
          .from("contact_attempts")
          .select("person_id, next_follow_up_at")
          .eq("created_by", session.id)
          .not("next_follow_up_at", "is", null)
          .lte("next_follow_up_at", endOfToday)
          .gte("next_follow_up_at", `${daysAgo(today, FOLLOW_UP_DAYS)}T00:00:00+01:00`)
          .order("next_follow_up_at", { ascending: true })
          .limit(FOLLOW_UP_CAP)
      : null,
    canSeeCrm
      ? supabase.from("reservations").select("id", { count: "exact", head: true }).eq("status", "awaiting_deposit")
      : null,
    canSeeMoney ? readInstallments(supabase, "overdue", { limit: 1 }) : null,
  ]);

  /** A count that was not read — the read failed, or there was nothing to read it by — is a dash, never a zero. */
  const count = (result: { count: number | null; error: unknown } | null) =>
    result && !result.error && result.count !== null ? result.count : null;

  /** How many PEOPLE those attempts are, which is one row each on the list this cell opens. */
  const duePeople =
    followUps && !followUps.error && followUps.data
      ? new Set(followUps.data.map((row) => row.person_id)).size
      : null;

  // Built by permission, in the order of the sale, so the strip reads as a pipeline left to right.
  const cells: Cell[] = [];

  if (canSeeCrm) {
    cells.push({
      label: "طلبات جديدة",
      value: count(fresh),
      href: newStatusId ? `/admin/v2/files?status_id=${newStatusId}` : undefined,
    });
  }
  if (isAdmin) {
    cells.push({
      label: "بلا مسؤول",
      value: count(unassigned),
      href: "/admin/leads?assigned_to=none&people=1",
    });
  }
  if (canFollowUp) {
    cells.push({ label: "متابعاتي المستحقة", value: duePeople, href: "/admin#follow-ups" });
  }
  if (canSeeCrm) {
    cells.push({
      label: "حجوزات تنتظر العربون",
      value: count(awaitingDeposit),
      href: "/admin/v2/reservations?filter=awaiting",
    });
  }
  if (canSeeMoney) {
    cells.push({
      label: "أقساط متأخرة",
      value: installments ? installments.counts.overdue : null,
      // A late instalment on a module that is off is still a late instalment, and the payload says which it
      // is — so the state gets its own line instead of a parenthetical the phone cuts off the label.
      note: installments?.moduleState === "disabled" ? "الوحدة مطفية" : undefined,
      href: "/admin/v2/installments?filter=overdue",
      alarm: true,
    });
  }

  // «Nothing is waiting» is a claim about every cell. One unread figure and the line is not printed at all.
  const allClear = cells.length > 0 && cells.every((cell) => cell.value === 0);

  return (
    <Screen
      title="اليوم"
      action={
        <p className="text-end text-[0.6875rem] leading-tight text-muted">
          <span className="tabular-nums">{formatDate(today)}</span>
          {allClear ? <span className="block">ما فماش حاجة تستنّى فيك.</span> : null}
        </p>
      }
    >
      {cells.length === 0 ? (
        <Rows empty="ما عندكش صلوحية تشوف أرقام اليوم." />
      ) : (
        <div
          className={`card grid grid-cols-2 gap-px overflow-hidden bg-line ${COLUMNS[cells.length] ?? "lg:grid-cols-5"}`}
        >
          {cells.map((cell, index) => {
            const waiting = (cell.value ?? 0) > 0;
            // An odd count leaves one slot open on the narrow two-column strip; the last cell takes it, so no
            // hairline gap is left showing where a figure should be.
            const fill = cells.length % 2 === 1 && index === cells.length - 1 ? "max-lg:col-span-2" : "";
            const skin = `flex items-baseline gap-2 bg-surface px-3 py-3 sm:py-2.5 ${fill}`;
            // ~115px of label inside a phone's two-column cell. Two lines instead of one truncated line is
            // what keeps «حجوزات تنتظر العربون» readable there; the title is for the desktop hover.
            const title = cell.note ? `${cell.label} · ${cell.note}` : cell.label;

            const body = (
              <>
                <span
                  className={`font-display text-lg font-bold leading-none tabular-nums ${
                    waiting ? (cell.alarm ? "text-danger" : "text-forest") : "text-muted"
                  }`}
                >
                  {cell.value === null ? "—" : formatCount(cell.value)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[0.6875rem] leading-tight text-muted">{cell.label}</span>
                  {cell.note ? (
                    <span className="block truncate text-[0.625rem] leading-tight text-gold">{cell.note}</span>
                  ) : null}
                </span>
              </>
            );

            return cell.href ? (
              <Link
                key={cell.label}
                href={cell.href}
                title={title}
                className={`${skin} transition-colors hover:bg-paper`}
              >
                {body}
              </Link>
            ) : (
              <div key={cell.label} title={title} className={skin}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
