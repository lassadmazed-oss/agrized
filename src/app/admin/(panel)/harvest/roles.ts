import type { StaffRole } from "@/lib/auth";

import type { HarvestStatus } from "./rpc";

/**
 * The TypeScript half of the harvest gates. Each list mirrors a predicate that already exists in the database —
 * none of them is a new role, and the database checks the same thing again in every RPC (bb_41 §7–§9).
 *
 * They live here rather than in ./actions.ts because a "use server" module may only export async functions, and
 * rather than in src/lib/auth.ts because that file is shared and is not this run's to edit. GROVE_ROLES belongs
 * beside LAND_OFFER_ROLES there; the report says so.
 */

/** app.can_manage_trees() (0054 §1): the agricultural manager runs the grove; Finance and Admin may too. */
export const GROVE_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/** app.can_edit_person(): the commercial who holds the file, or Admin. Nobody speaks for a stranger's file. */
export const FILE_ROLES = ["commercial", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/**
 * The transitions public.staff_set_harvest_status allows, so the screen offers exactly what the database will
 * accept. 'settled' appears nowhere: it is what settlement leaves behind, never a word somebody chooses, and a
 * settled season is terminal.
 */
export const NEXT_STATUSES: Record<HarvestStatus, HarvestStatus[]> = {
  planned: ["harvesting", "cancelled"],
  harvesting: ["planned", "closed", "cancelled"],
  closed: ["harvesting", "cancelled"],
  settled: [],
  cancelled: ["planned"],
};
