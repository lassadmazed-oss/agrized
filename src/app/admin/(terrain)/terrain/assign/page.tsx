import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";

import { STEP_LABELS } from "../field-model";
import { readCandidates } from "../read";

import { AssignForm, RemoveButton } from "./assign-form";

export const metadata: Metadata = { title: "وزّع الزيارات" };

/**
 * «احنا الادمين نقولوا له راهو انت عندك 10 من الناس مش يشوفوا، ونحدد شكون هو الكوميرسيال اللي مش يمشي».
 * The people who asked to see the land and are on nobody's list, ticked and handed to one commercial; and
 * under them, each commercial's list as it stands.
 */
export default async function AssignPage() {
  await requireStaff(ADMIN_ROLES);
  const { data, error } = await readCandidates();

  if (!data) {
    return (
      <div className="card p-5 leading-7">
        <p className="font-semibold text-ink">ما نجمناش نقراو الطلبات.</p>
        <p className="mt-1 text-sm text-muted">حدّث الصفحة. إذا تعاودت: «{error ?? "admin_field_candidates"}».</p>
      </div>
    );
  }

  const names = new Map(data.commercials.map((item) => [item.id, item.full_name]));
  const lists = new Map<string, typeof data.listed>();
  for (const row of data.listed) lists.set(row.commercial_id, [...(lists.get(row.commercial_id) ?? []), row]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-forest sm:text-3xl">وزّع الزيارات</h1>
        <p className="leading-7 text-ink/80">
          علّم على الناس اللي يحبّو يزورو الأرض، اختار الكوميرسيال اللي باش يمشي، واضغط. يلقاهم في التابلات متاعو، يكلّمهم،
          يحدّد الموعد، يورّيهم الأرض ويرجعلنا بالنتيجة.
        </p>
      </header>

      <AssignForm candidates={data.candidates} commercials={data.commercials} />

      {lists.size > 0 ? (
        <section className="space-y-4 border-t border-line pt-6">
          <h2 className="text-lg font-bold text-forest">الليستات توّا</h2>
          {[...lists.entries()].map(([commercialId, rows]) => (
            <div key={commercialId} className="card space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-ink">
                  {names.get(commercialId) ?? "—"} <span className="tabular-nums text-muted">{formatCount(rows.length)}</span>
                </p>
                <Link href={`/admin/terrain?who=${commercialId}`} className="btn btn-ghost btn-sm">
                  شوف الليستا متاعو
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((row) => (
                  <li key={row.person.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/admin/terrain/${row.person.id}`} className="font-semibold text-ink hover:text-forest">
                      {row.person.full_name}
                    </Link>
                    <span className="rounded-full bg-paper px-2 text-xs text-muted">{STEP_LABELS[row.step]}</span>
                    <span className="text-xs text-muted">من {formatDate(row.assigned_at)}</span>
                    <span className="ms-auto">
                      <RemoveButton personId={row.person.id} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
