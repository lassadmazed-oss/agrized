"use server";

// The one act the workspace switcher performs: remember the job the reader chose, and open it on its queue.
//
// A "use server" file may export ONLY async functions — this repo has shipped that bug once already, which is
// why the cookie name, the keys and the model all live in src/components/admin/workspaces.ts and nothing but
// the action is here.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { heldWorkspaces, WORKSPACE_COOKIE } from "@/components/admin/workspaces";
import { requireStaff } from "@/lib/auth";

/** A year. The choice is a habit, not a session: a commercial who picked المبيعات does not pick it again tomorrow. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Sets agrized.workspace and redirects to that workspace's landing.
 *
 * The key comes from a form field and is trusted for nothing: it is looked up among the workspaces THIS SESSION
 * holds, so a posted «finance» from a commercial writes no cookie and opens no door — the request is answered
 * with the dashboard, which for a single-workspace reader redirects to their own queue. The cookie changes what
 * the sidebar draws and nothing else; every page keeps its own requireStaff().
 */
export async function chooseWorkspace(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const requested = formData.get("workspace");
  const target = heldWorkspaces(session.roles).find((workspace) => workspace.key === requested);
  if (!target) redirect("/admin");

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, target.key, {
    // The layout under /admin is the only reader, so the cookie travels nowhere else.
    path: "/admin",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect(target.landing);
}
