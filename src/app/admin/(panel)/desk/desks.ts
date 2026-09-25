// The team desks: where each team LANDS, as opposed to the one Back Office everybody shares today.
//
// The owner, 2026-09-21: «نحبّو الـBack Office متاع AgriZed يخدم كـمسار واحد متواصل للحريف، موش Interfaces
// منفصلة». His §3 and §7 then ask for the opposite-looking thing — a call-centre screen and a field-commercial
// screen — and both are true at once: ONE journey, but each team standing at its own door onto it. A desk is
// that door. It is not a copy of the Back Office; every desk links back into the same client file, the same
// visits engine, the same reservations.
//
// WHAT THIS FILE IS NOT. It is not a role model. public.app_role holds ONE `commercial`, so §3's phone agent
// and §7's Commercial Terrain are the same principal to every RLS policy and every security-definer RPC in the
// database. Splitting them is a migration and an owner decision (a new enum value, or a team column on
// profiles) and it is deliberately NOT faked here: a TypeScript list that pretended the two teams were
// different would grant nothing, refuse nothing, and lie about both. Until that decision is taken, a
// `commercial` lands on the call desk, because that is the desk that exists.
//
// ROLE LISTS. CALL_DESK_ROLES below is a fourteenth private copy of a role list, which is a known problem in
// this codebase — src/app/admin/(panel)/contracts/roles.ts calls itself «the FIFTH private copy of the same
// four roles». It stays private on purpose: src/lib/auth.ts is being read by several live sessions, and the
// moment to gather the copies is when the §27 work lands and touches those files anyway. Each copy therefore
// names the SQL predicate it mirrors, so a drifted copy is a screen that lies about a refusal and never a
// refusal that does not happen — the database refuses either way.

import { CRM_READ_ROLES, type StaffRole } from "@/lib/auth";

import { LEGAL_DESK_ROLES } from "./legal/roles";

/**
 * Who works the call desk.
 *
 * Mirrors app.can_edit_person() — supabase/migrations/0008_crm_edit_rights.sql:4-17 — which is «admin, or the
 * commercial this file is assigned to». That predicate is the one that actually holds: it gates the INSERT
 * policy on public.contact_attempts and on public.person_notes, and the persons_update policy behind a status
 * change. Finance and Legal READ every client file (app.can_see_person) but may not log a call or move a
 * status, so putting them on a screen whose two acts are exactly those would draw them two controls the
 * database refuses. §27: «ما نعطيوش كل موظف access لحاجات ما يحتاجهاش».
 */
export const CALL_DESK_ROLES = ["commercial", "admin", "super_admin"] as const satisfies readonly StaffRole[];

export type Desk = {
  href: string;
  /** The team's own name for its door, in Arabic. Staff copy, the precedent nav-model.ts set. */
  label: string;
  /** One sentence saying what is behind the door, for the chooser. */
  description: string;
  roles: readonly StaffRole[];
};

/**
 * Every desk that HAS A SCREEN BEHIND IT.
 *
 * The rule is the one src/components/admin/nav-model.ts already fought for and states in its own comment:
 * no row without something real behind it. Five sidebar rows were removed on 2026-08-18 because each opened
 * onto a page that said the domain was not built yet, and «a row that leads nowhere costs a reader more than
 * it tells them». So §7's «زياراتي» (Commercial Terrain) and §16's Legal desk get NO row here until their
 * screens exist; adding one is one line in this array, which is the whole point of the array.
 */
export const DESKS: readonly Desk[] = [
  {
    href: "/admin/desk/calls",
    label: "طلبات الحرفاء",
    description: "المكالمات: شكون لازم تكلّمو اليوم، شكون مازال ما تكلّمناش معاه، وشكون وعدناه بمكالمة.",
    roles: CALL_DESK_ROLES,
  },
  {
    // §7 — INTERFACE 2, «زياراتي». Not this run's screen: it is registered here, with the gate ITS OWN page
    // applies (CRM_READ_ROLES), so the door leads to every desk that exists rather than to the one that
    // happened to be written first. Its own route stays the authority on who may open it — this row only
    // decides whether the link is drawn.
    href: "/admin/desk/field",
    label: "زياراتي",
    description: "الزيارات الميدانية متاعك: شكون تشوف اليوم، وين، وشنوّا يحب — قبل ما تتحرّك.",
    roles: CRM_READ_ROLES,
  },
  {
    // §16 — INTERFACE 3. Its screens now exist, so the row the comment above reserved is drawn.
    //
    // WITHOUT THIS ROW THE DOOR MISROUTES. desksFor() returned exactly one desk for `legal` and for
    // `finance` — «زياراتي», because both sit inside CRM_READ_ROLES — and DeskPage redirects on a single
    // desk, so opening /admin/desk sent the legal team into the field commercial's visit board while their
    // own desk stayed reachable only by typing the URL. Two desks now, so they get the chooser.
    //
    // The gate here is the one ITS OWN routes apply (LEGAL_DESK_ROLES, mirroring app.can_contract_trees());
    // this row only decides whether the link is drawn, and staff_legal_queue refuses a `commercial` in
    // Postgres either way.
    href: "/admin/desk/legal",
    label: "القانوني وإتمام البيع",
    description: "الملفات اللي خلّصت العربون: الوثائق، موعد العقد، والإمضاء.",
    roles: LEGAL_DESK_ROLES,
  },
];

/** The desks this session may open, in the order above. */
export function desksFor(roles: readonly StaffRole[]): Desk[] {
  return DESKS.filter((desk) => desk.roles.some((role) => roles.includes(role)));
}
