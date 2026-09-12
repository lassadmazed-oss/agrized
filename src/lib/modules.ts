import "server-only";

import { getStaffSession } from "@/lib/auth";
import { flagState, type PublicConfig } from "@/lib/config";

/**
 * open    → module is public (FLAG-01 "public")
 * preview → module is "internal" and the visitor is signed-in staff
 * closed  → disabled, or internal for a visitor. Pages show "coming soon" and actions refuse (FLAG-02).
 */
export type ModuleAccess = "open" | "preview" | "closed";

export async function moduleAccess(config: PublicConfig, key: string): Promise<ModuleAccess> {
  const state = flagState(config, key);
  if (state === "public") return "open";
  if (state === "internal" && (await getStaffSession())) return "preview";
  return "closed";
}
