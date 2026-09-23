import type { Metadata } from "next";

import { EmptyState, StatTile } from "@/components/ui";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { tunisToday } from "@/lib/backoffice/leads/dates";
import { readInstallments } from "@/lib/backoffice/installments/rpc";

export const metadata: Metadata = { title: "اليوم" };

/**
 * اليوم — what is waiting, and nothing else.
 *
 * ONE RULE GOVERNS THIS SCREEN: every tile is a count of rows that exist, and every tile is a door into the
 * list it counted. No figure here is derived in TypeScript, no figure stands in for something that was not
 * counted, and a count that could not be read prints «—» rather than a zero. A zero and a failed read look
 * identical on a dashboard and mean opposite things — one says «nothing to do», the other says «you are
 * flying blind» — so they are never allowed to wear the same face.
 *
 * WHY SO FEW TILES. The owner asked for «simple look, less text … easy for anyone to understand». Five
 * numbers can be read at a glance and acted on; eleven cannot, and the v1 dashboard already carries the wide
 * view for anyone who wants it. Each tile below is a step of the sale, in order, so the screen reads as a
 * pipeline rather than as a report.
 */
export default async function TodayPage() {
  const session = await requireStaff();
  const supabase = await createClient();

  const canSeeCrm = hasRole(session, CRM_READ_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const canSeeMoney = hasRole(session, PRICE_ROLES);

  const today = tunisToday();
  const endOfToday = `${today}T23:59:59+01:00`;

  // The «جديد» status is a row the owner can rename or reorder, never a string in the code.
  const { data: statuses } = canSeeCrm
    ? await supabase.from("lead_statuses").select("id, stage, is_stage_default").eq("stage", "new")
    : { data: null };
  const newStatusId = (statuses ?? []).find((row) => row.is_stage_default)?.id ?? (statuses ?? [])[0]?.id ?? null;

  const [fresh, unassigned, followUps, awaitingDeposit, installments] = await Promise.all([
    canSeeCrm && newStatusId
      ? supabase.from("persons").select("id", { count: "exact", head: true }).eq("status_id", newStatusId)
      : null,
    isAdmin ? supabase.from("persons").select("id", { count: "exact", head: true }).is("assigned_to", null) : null,
    canSeeCrm
      ? supabase
          .from("contact_attempts")
          .select("id", { count: "exact", head: true })
          .not("next_follow_up_at", "is", null)
          .lte("next_follow_up_at", endOfToday)
      : null,
    canSeeCrm
      ? supabase.from("reservations").select("id", { count: "exact", head: true }).eq("status", "awaiting_deposit")
      : null,
    canSeeMoney ? readInstallments(supabase, "overdue", { limit: 1 }) : null,
  ]);

  /** A count that was not read — no permission, or the read failed — is a dash, never a zero. */
  const count = (result: { count: number | null; error: unknown } | null) =>
    result && !result.error && result.count !== null ? result.count : null;

  const tiles = [
    { label: "طلبات جديدة", value: count(fresh), href: newStatusId ? `/admin/leads?status_id=${newStatusId}&people=1` : undefined },
    { label: "بلا مسؤول", value: count(unassigned), href: "/admin/leads?assigned_to=none&people=1" },
    { label: "متابعات اليوم", value: count(followUps), href: undefined },
    { label: "حجوزات تنتظر العربون", value: count(awaitingDeposit), href: "/admin/reservations" },
    { label: "أقساط متأخرة", value: installments ? installments.counts.overdue : null, href: "/admin/installments" },
  ];

  const anything = tiles.some((tile) => (tile.value ?? 0) > 0);

  return (
    <div className="space-y-6">
      <h1 className="section-title">اليوم</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value === null ? "—" : tile.value}
            href={tile.href}
            emphasis={(tile.value ?? 0) > 0}
            quiet={tile.value === 0}
          />
        ))}
      </div>

      {!anything ? <EmptyState>ما فماش حاجة تستنّى فيك اليوم.</EmptyState> : null}
    </div>
  );
}
