import "server-only";

import type { StaffRole } from "@/lib/auth";

/**
 * The TypeScript half of the legal desk's gates. Each list mirrors a predicate that ALREADY EXISTS in the
 * database; none of them is a new role, and every RPC and every RLS policy checks the same thing again. The
 * lists here exist so a refusal is a readable Arabic sentence and a control the database would refuse is
 * never drawn.
 *
 * WHY THEY ARE HERE AND NOT IN src/lib/auth.ts. That file is shared and several sessions are live in it right
 * now; ../../contracts/roles.ts and ../../harvest/roles.ts both made the same call for the same reason, and
 * ../desks.ts counts itself as the fourteenth copy. LEGAL_DESK_ROLES belongs beside PRICE_ROLES there, and
 * the handover says so. Until that gathering happens, each copy NAMES the SQL predicate it mirrors, so a
 * drifted copy is a screen that lies about a refusal — never a refusal that does not happen.
 *
 * "use server" is why this is a module of its own: an actions file may only export async functions.
 */

/**
 * app.can_contract_trees() (0054:85) — legal · finance · admin · super_admin. In
 * supabase/pending/bb_72_partners_closing.sql it is reached from RLS through the granted alias
 * app.can_see_legal_desk(), which wraps it and holds no list of its own.
 *
 * THIS IS §27's OWN EXAMPLE, so it is worth saying plainly: a `commercial` — which today is BOTH the
 * call-centre agent of §3 and the field commercial of §7, because public.app_role has one value for the two
 * teams — cannot open this desk. Not the queue, not a file, not the partner directory, and not by typing the
 * URL: staff_legal_queue raises `forbidden`, and the four tables' policies return no rows. The gate below is
 * the second layer, drawn so the reader is redirected instead of meeting a blank screen.
 *
 * The database narrows it further with app.can_see_person, which is NOT mirrored here — a role list cannot
 * express «their own file», and guessing at it in TypeScript is how a screen starts lying about a refusal.
 */
export const LEGAL_DESK_ROLES = ["legal", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/**
 * app.is_admin() — admin · super_admin. Two acts only.
 *
 * 1. WAIVING a mandatory checklist item (§20). A rule with no recorded exception is a rule somebody
 *    eventually switches off entirely, so the exception exists, it is the Admin's, it demands a written
 *    reason of its own, and it lands in /admin/audit. The database refuses everyone else and refuses even an
 *    Admin when settings legal.allow_waiver is off.
 * 2. EDITING the checklist template, which is settings-grade data: public.legal_checklist_items has the same
 *    admin-only insert/update policies public.lead_statuses has.
 */
export const LEGAL_WAIVE_ROLES = ["admin", "super_admin"] as const satisfies readonly StaffRole[];
