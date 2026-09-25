import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";

import { UserMenu, WorkflowNav } from "./workflow-nav";

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
 * THE BAR IS 44px TALL, AND THAT IS THE POINT OF THIS FILE. It was 69: py-3 wrapped around a 44px «خروج»
 * button, and beside it a two-line name-and-role block. This bar is drawn on all five screens, so a pixel
 * here is spent five times — and it was spending them on a name that never changes and a logout pressed once
 * a day. Both moved into the popup behind the initial in workflow-nav.tsx. What is left is the wordmark, the
 * five links and that initial, none of them taller than the tap target the bar now is: 24px back on every
 * screen, permanently.
 *
 * AND IT STICKS, which only a slim bar can afford. The spine is now reachable from the bottom of a long
 * أقساط list without scrolling back to the top first — the one step this shell used to force on every single
 * navigation.
 *
 * THE PAGE PADDING went from py-6/py-8 to py-4/py-5 for the same reason: 32px of empty paper above a screen
 * whose first row is already a card with its own 16px inside it was measuring generosity twice.
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
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-11 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link href="/admin/v2" className="shrink-0">
            <Wordmark className="text-base sm:text-lg" />
          </Link>

          <WorkflowNav />

          <UserMenu
            name={session.fullName}
            roles={session.roles.map((role) => ROLE_LABELS[role])}
            email={session.email}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-5">{children}</main>
    </div>
  );
}
