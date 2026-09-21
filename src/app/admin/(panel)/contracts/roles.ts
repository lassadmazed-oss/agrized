import "server-only";

import type { StaffRole } from "@/lib/auth";

/**
 * The TypeScript half of the contract gates. Each list mirrors a predicate that ALREADY EXISTS in the
 * database, none of them is a new role, and every RPC checks the same thing again — the lists here exist so a
 * refusal is a readable Arabic sentence and a control that would always fail is never drawn.
 *
 * WHY THEY ARE HERE AND NOT IN src/lib/auth.ts. That file is shared and is not this run's to edit; the harvest
 * module set the precedent with its own roles.ts for the same reason. CONTRACT_ROLES belongs beside
 * PRICE_ROLES there, and the handover says so — it is the FIFTH private copy of the same four roles
 * (src/app/admin/(panel)/leads/[personId]/page.tsx:48 and src/app/admin/(panel)/projects/actions.ts:23 both
 * hold a TREE_CONTRACT_ROLES of their own), and the day somebody edits one of the five is the day the screen
 * and the database disagree about who may sign.
 *
 * "use server" is why this is a module of its own: an actions file may only export async functions.
 */

/**
 * app.can_contract_trees() (0054:85) — legal · finance · admin · super_admin.
 *
 * 0054's own comment: «Marking a tree sold is the contract moment, so it stays with Legal, Finance and Admin.
 * A commercial may reserve for their own file and no more.» The consequence is worth stating plainly on the
 * screen, because it will be the first complaint: THE COMMERCIAL WHO SOLD THE DEAL CANNOT SIGN IT. That is
 * the rule 0054 set, not one this module invented.
 *
 * The database narrows it further with app.can_see_person, which is not mirrored here — a role list cannot
 * express «their own file», and guessing at it in TypeScript is how a screen starts lying about a refusal.
 */
export const CONTRACT_ROLES = ["legal", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/**
 * RECORDING MONEY IS NOT DECLARED HERE. app.can_record_money() (0063:98) is finance · admin · super_admin,
 * deliberately without legal — 0063's comment: «signing the contract and taking the cash are two different
 * desks» — and that is EXACTLY PRICE_ROLES in src/lib/auth.ts. Every call site that records or voids an
 * instalment imports PRICE_ROLES straight from there. A second name for the same four roles is the drift this
 * file exists to stop, so there is no MONEY_ROLES alias.
 */

/**
 * Cancelling a contract has to put its trees back, so it needs app.can_contract_trees ∩ app.can_manage_trees ∩
 * app.can_see_person. Those three meet on finance · admin · super_admin — the same three as the money gate,
 * written out here so the screen's gate and the SQL's three-way check can be read side by side.
 *
 * It is a HUMAN act, always. Both documents forbid the automatic alternative in the same words — v2 §36 «لا
 * يوجد فسخ آلي» and v3 §31 «ما نخليوش النظام يلغي الملكية أو العقد قانونياً وحده» — so no timer, no cron and
 * no trigger reaches this path.
 */
export const CANCEL_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
