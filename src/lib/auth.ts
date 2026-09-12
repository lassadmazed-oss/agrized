import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type StaffRole = Exclude<AppRole, "client">;

export const ROLE_LABELS: Record<AppRole, string> = {
  client: "حريف",
  commercial: "Commercial",
  agri_manager: "مسؤول فلاحي",
  finance: "Finance",
  legal: "Legal",
  admin: "Admin",
  super_admin: "Super Admin",
};

export const ADMIN_ROLES = ["admin", "super_admin"] as const satisfies readonly StaffRole[];
export const CRM_READ_ROLES = ["commercial", "finance", "legal", "admin", "super_admin"] as const satisfies readonly StaffRole[];
export const LAND_OFFER_ROLES = ["agri_manager", "legal", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

export type StaffSession = {
  id: string;
  fullName: string;
  email: string | null;
  roles: StaffRole[];
};

/** The signed-in staff member, or null. Deduplicated per request. */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_active").eq("id", claims.sub).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", claims.sub),
  ]);
  if (!profile?.is_active) return null;

  const staffRoles = (roles ?? [])
    .map((row) => row.role)
    .filter((role): role is StaffRole => role !== "client");
  if (staffRoles.length === 0) return null;

  return {
    id: claims.sub,
    fullName: profile.full_name,
    email: typeof claims.email === "string" ? claims.email : null,
    roles: staffRoles,
  };
});

export function hasRole(session: StaffSession, roles: readonly StaffRole[]): boolean {
  return session.roles.some((role) => roles.includes(role));
}

/** Use at the top of every Back Office page and Server Action. */
export async function requireStaff(roles?: readonly StaffRole[]): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");
  if (roles && !hasRole(session, roles)) redirect("/admin?denied=1");
  return session;
}
