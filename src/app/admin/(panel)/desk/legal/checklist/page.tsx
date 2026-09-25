import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { GATES } from "../legal-model";
import { readChecklistTemplate } from "../read";
import { LEGAL_DESK_ROLES } from "../roles";

import { ChecklistItemActs, ChecklistItemForm } from "./checklist-form";

export const metadata: Metadata = { title: "بنود القائمة القانونية" };

/**
 * §20's list, as the owner's own data.
 *
 * WHY THIS SCREEN EXISTS AT ALL. The brief says the items «are the owner's data and he will change them». A
 * table nobody can edit from the Back Office is not the owner's data, it is a seed — so the template gets a
 * screen, here rather than in /admin/settings/lists, because public.legal_checklist_items is NOT an option
 * list: it carries two columns an option row cannot (whether an item is mandatory, and which of the three
 * moments it blocks), and that settings screen builds itself from public.option_lists.
 *
 * EDITING HERE NEVER REACHES A FILE THAT EXISTS. Every legal file carries its own copy of this list, taken
 * the day it opened, and the database's gate reads only the copy. So renaming an item, making it optional or
 * putting it out of service changes what the NEXT file is opened with and nothing else — which is the same
 * guarantee from the other side as «adding an item later cannot break a closed file». The screen says so
 * under the form rather than leaving it to be discovered.
 *
 * READ BY THE WHOLE DESK, WRITTEN BY THE ADMIN. `canEdit` comes from app.is_admin() inside the RPC, not from
 * a role list on this page, so the editor is drawn exactly when the database would accept it.
 */
export default async function ChecklistTemplatePage() {
  await requireStaff(LEGAL_DESK_ROLES);

  const supabase = await createClient();
  const [template, { data: settingRows }] = await Promise.all([
    readChecklistTemplate(supabase),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  return (
    <div className="space-y-4">
      <nav aria-label="مسار الصفحة" className="text-sm">
        <Link href="/admin/desk/legal" className="text-muted underline-offset-4 hover:text-forest hover:underline">
          ← القانوني وإتمام البيع
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        level={1}
        title="بنود القائمة القانونية"
        description="شنوّة يلزم يتثبّت فيه قبل ما يتكتب العقد، قبل الإمضاء، وقبل تسجيل التملّك. البند الإجباري يوقّف البيعة في قاعدة البيانات روحها — موش زرّ مطفي."
      />

      {template === null ? (
        <EmptyState title="ما نجمناش نقراو القائمة.">
          إذا كانت هذي أول مرة، جداول المكتب القانوني مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_72_partners_closing.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة.
        </EmptyState>
      ) : (
        <>
          {!template.canEdit ? (
            <p className="card p-cozy text-sm leading-6">
              تنجم تقرا البنود، أما تبديلهم للإدارة برك: البند هنا قاعدة، موش كلمة — «إجباري» معناها أنّ قاعدة
              البيانات باش ترفض البيعة حتى يتعلّم.
            </p>
          ) : null}

          {GATES.map((gate) => {
            const rows = template.rows.filter((row) => row.requiredAt === gate);
            return (
              <section key={gate} className="card p-cozy">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="section-title">{template.gateLabels[gate] ?? gate}</h2>
                  <span className="text-sm text-muted tabular-nums">
                    {formatCount(rows.filter((row) => row.isActive && row.isMandatory).length)} إجباري
                  </span>
                </div>

                {rows.length === 0 ? (
                  <EmptyState size="sm" variant="plain" className="mt-3">
                    ما فماش بنود في هذي اللحظة.
                  </EmptyState>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {rows.map((row) => (
                      <li key={row.id} className="rounded-xl border border-line p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-sm font-medium leading-6">{row.label}</span>
                            {row.help ? <span className="block text-xs text-muted">{row.help}</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {row.isMandatory ? (
                              <StatusPill tone="danger">إجباري</StatusPill>
                            ) : (
                              <StatusPill tone="neutral">اختياري</StatusPill>
                            )}
                            {!row.isActive ? <StatusPill tone="neutral">خارج الخدمة</StatusPill> : null}
                          </div>
                        </div>
                        {template.canEdit ? (
                          <ChecklistItemActs item={row} gateLabels={template.gateLabels} reasonMin={reasonMin} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {template.canEdit ? (
            <section className="card p-cozy">
              <h2 className="section-title">زيد بند</h2>
              <div className="mt-3">
                <ChecklistItemForm gateLabels={template.gateLabels} reasonMin={reasonMin} />
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
