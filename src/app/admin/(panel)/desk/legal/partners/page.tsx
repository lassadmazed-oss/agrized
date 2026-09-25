import type { Metadata } from "next";
import Link from "next/link";

import { DataRow, DataList, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readPartners } from "../read";
import { LEGAL_DESK_ROLES } from "../roles";

import { PartnerActs, PartnerForm } from "./partner-form";

export const metadata: Metadata = { title: "دليل الشركاء" };

/**
 * §18 — «المحامون وعدول الإشهاد والخبراء والمسّاحون».
 *
 * IT IS A PHONEBOOK, AND ON PURPOSE. The only structural link the brief describes is §19's: the closing
 * appointment names a lawyer or a notary. So a partner is picked on the appointment and nowhere else, and
 * there is no file↔partner join table here — inventing one, so that an expert and a surveyor could also be
 * attached to a file, would be guessing at a workflow nobody has described. The directory stays equally
 * useful to all four specialities as what it is: the list you look a number up in.
 *
 * THE FOUR SPECIALITIES ARE THE OWNER'S DATA, not a union in this file: they are rows of the option list
 * `partner_speciality`, which he edits in الإعدادات ← القوائم, and the region is public.governorates. The
 * label is snapshot onto a partner when they are saved — renaming «عدل إشهاد» next year must not rewrite an
 * appointment that already happened.
 *
 * WHO OPENS IT. app.can_contract_trees() — legal · finance · admin · super_admin. It holds third parties'
 * personal phone numbers, so a `commercial` is refused by the database (staff_partners raises `forbidden`)
 * and the rows themselves are closed to them by RLS.
 */
export default async function PartnersPage({ searchParams }: PageProps<"/admin/desk/legal/partners">) {
  await requireStaff(LEGAL_DESK_ROLES);
  const params = await searchParams;

  const speciality = typeof params.speciality === "string" ? params.speciality : null;
  const search = typeof params.q === "string" && params.q.trim() ? params.q.trim() : null;
  const archived = params.archived === "1";

  const supabase = await createClient();
  const [directory, { data: settingRows }] = await Promise.all([
    readPartners(supabase, { speciality, search, includeArchived: archived }),
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
        title="دليل الشركاء"
        description="المحامون وعدول الإشهاد والخبراء والمسّاحون: الاسم، الهاتف، المكتب، الولاية، الاختصاص والتوفر. منّو تختار شكون يمضي العقد."
      />

      {directory === null ? (
        <EmptyState title="ما نجمناش نقراو دليل الشركاء.">
          إذا كانت هذي أول مرة، جداول المكتب القانوني مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_72_partners_closing.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة.
        </EmptyState>
      ) : (
        <>
          <form method="get" className="card grid gap-3 p-cozy sm:grid-cols-[1fr_auto_auto_auto]">
            <label className="min-w-0">
              <span className="label label-sm">تلوّج</span>
              <input
                name="q"
                type="search"
                defaultValue={search ?? ""}
                placeholder="اسم، مكتب، ولا رقم هاتف"
                className="field field-sm"
              />
            </label>
            <label>
              <span className="label label-sm">الاختصاص</span>
              <select name="speciality" defaultValue={speciality ?? ""} className="field field-sm">
                <option value="">الكل</option>
                {directory.specialities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" name="archived" value="1" defaultChecked={archived} className="size-5 accent-forest" />
              <span className="text-sm">حتى المؤرشفين</span>
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn btn-secondary btn-sm w-full">
                فرز
              </button>
            </div>
          </form>

          {directory.rows.length === 0 ? (
            <EmptyState title="ما فماش شركاء في هذا الفرز.">
              زيد أول محامي ولا عدل إشهاد من التحت، باش تنجم تختارو وقت ما تحدّد موعد العقد.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {directory.rows.map((partner) => (
                <li key={partner.id} className="card p-cozy">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-semibold text-forest">{partner.fullName}</span>
                      {partner.officeName ? (
                        <span className="mt-0.5 block text-xs text-muted">{partner.officeName}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.specialityLabel ? (
                        <StatusPill tone="brand">{partner.specialityLabel}</StatusPill>
                      ) : null}
                      {!partner.isActive ? <StatusPill tone="neutral">مؤرشف</StatusPill> : null}
                      {partner.isActive && !partner.isAvailable ? (
                        <StatusPill tone="warning">ما يقبلش مواعيد</StatusPill>
                      ) : null}
                    </div>
                  </div>

                  <DataList variant="grid" columns={2} className="mt-3 text-sm">
                    <DataRow label="الهاتف" layout="stacked" numeric={false}>
                      <span dir="ltr">{partner.phone ?? "—"}</span>
                    </DataRow>
                    <DataRow label="الولاية" layout="stacked" numeric={false}>
                      {partner.governorate ?? "—"}
                    </DataRow>
                    <DataRow label="البريد" layout="stacked" numeric={false}>
                      <span dir="ltr">{partner.email ?? "—"}</span>
                    </DataRow>
                    <DataRow label="التوفر" layout="stacked" numeric={false}>
                      {partner.availabilityNote ?? "—"}
                    </DataRow>
                  </DataList>

                  {partner.note ? <p className="hint mt-2 leading-6">{partner.note}</p> : null}

                  <PartnerActs
                    partner={partner}
                    specialities={directory.specialities}
                    governorates={directory.governorates}
                    reasonMin={reasonMin}
                  />
                </li>
              ))}
            </ul>
          )}

          <section className="card p-cozy">
            <h2 className="section-title">زيد شريك</h2>
            <p className="hint mt-1">
              الاختصاصات تتزاد وتتنحّى من{" "}
              <Link
                href="/admin/settings/lists"
                className="font-semibold underline underline-offset-4"
              >
                الإعدادات ← القوائم
              </Link>
              ، في قائمة «اختصاصات الشركاء».
            </p>
            <div className="mt-3">
              <PartnerForm
                specialities={directory.specialities}
                governorates={directory.governorates}
                reasonMin={reasonMin}
              />
            </div>
          </section>

          <p className="hint">
            {formatCount(directory.rows.length)} شريك معروض.
          </p>
        </>
      )}
    </div>
  );
}
