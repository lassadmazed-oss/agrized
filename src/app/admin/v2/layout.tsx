import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";

import { signOut } from "../login/actions";

import { WorkflowNav } from "./workflow-nav";

export const metadata: Metadata = {
  title: { default: "الإدارة", template: "%s · الإدارة" },
  robots: { index: false, follow: false },
};

/**
 * الإدارة v2 — the Back Office arranged as the sale actually happens.
 *
 * v1 is untouched and still at /admin: it is organised by TABLE — leads, projects, reservations, contracts,
 * installments, each its own island with its own filters. That is the right shape for someone who already
 * knows the system and is looking for a record. It is the wrong shape for doing the day's work, where the
 * question is never «which table» but «what is waiting for me, and what is the next step on this client»
 * (owner, 2026-09-23: the workflow «from the client filling the form to my steps»).
 *
 * So v2 is one spine, in the order of the sale: اليوم · الملفات · الحجوزات · العقود · الأقساط. Five words.
 *
 * WHAT THIS SHELL DELIBERATELY DOES NOT HAVE, because v1 has all of it and the owner asked for «simple look,
 * less text»: no sidebar with eleven groups, no breadcrumb, no role banner, no description under any heading.
 * A screen here shows figures and the one action that moves them. Anything a reader must be TOLD in a
 * paragraph is a screen that has not been designed yet.
 */
export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin/v2" className="shrink-0">
            <Wordmark className="text-xl" />
          </Link>

          <WorkflowNav />

          <div className="ms-auto flex items-center gap-3">
            <span className="hidden text-xs leading-tight text-muted sm:block">
              {session.fullName}
              <span className="block text-[0.6875rem]">
                {session.roles.map((role) => ROLE_LABELS[role]).join(" · ")}
              </span>
            </span>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost btn-sm">
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
