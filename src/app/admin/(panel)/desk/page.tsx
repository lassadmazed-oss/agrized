// /admin/desk — the door. It holds nothing of its own; it decides which desk you are standing at.
//
// Today exactly one desk exists (./desks.ts), so every session that has one is redirected straight into it and
// this screen draws nothing. The chooser under the redirect is for the reader who has more than one — a manager
// who works the phones in the morning and signs off a file in the afternoon — and for the day §7 and §16 add
// their rows. It is four lines of markup and it is the reason /admin/desk can be given to somebody as «your
// starting point» before all three desks exist.
//
// A session with NO desk is not an error and is not redirected anywhere: agri_manager reads no client file at
// all (app.can_see_person returns false for them on every person), so there is no queue that could be theirs.
// They are told which screen is, rather than being bounced to one they cannot use.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, SectionHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";

import { desksFor } from "./desks";

export const metadata: Metadata = { title: "مكتبي" };

export default async function DeskPage() {
  const session = await requireStaff();
  const desks = desksFor(session.roles);

  if (desks.length === 1) redirect(desks[0].href);

  return (
    <div className="space-y-6">
      <SectionHeader
        level={1}
        title="مكتبي"
        description={`مرحباً ${session.fullName || ""}. اختر المكتب اللي باش تخدم منّو.`}
      />

      {desks.length === 0 ? (
        <EmptyState title="ما عندكش مكتب هنا">
          الدور متاعك ما يتعاملش مباشرة مع ملفات الحرفاء. خدمتك تلقاها في «لوحة القيادة» وفي «العروض».
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {desks.map((desk) => (
            <li key={desk.href}>
              <Link href={desk.href} className="card block p-5 transition-colors hover:border-forest">
                <span className="block font-semibold text-forest">{desk.label}</span>
                <span className="mt-1 block text-sm leading-6 text-muted">{desk.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
