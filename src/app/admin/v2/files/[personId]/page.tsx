import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { FileActions } from "./file-actions";
import { RequestCard, type RequestDetails } from "./request-card";

export const metadata: Metadata = { title: "الملف" };

/**
 * ملف عميل — everything about one client on one screen, with the next step at the top of it.
 *
 * WHAT ORDER, AND WHY. The file opens with the two things a commercial needs before speaking: the phone, and
 * where this client stands. Then the acts, because a file that cannot be advanced from the screen you are
 * reading is a report, not a workspace. History comes last: it answers «شنوّة صار» and nobody reads it before
 * dialling.
 *
 * THE TREES ARE READ FROM public.trees, never counted off a demand. What a client ASKED for lives on his
 * request; what he HOLDS is inventory, and only the inventory table knows whether an allocation actually
 * happened. Printing the request's figure as though it were stock is how a system ends up selling the same
 * tree twice.
 */
export default async function FilePage({ params }: PageProps<"/admin/v2/files/[personId]">) {
  await requireStaff();
  const { personId } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("persons")
    .select("id, full_name, phone_e164, status_id, assigned_to, cin, cin_issued_on, birth_date, birth_place, address_line")
    .eq("id", personId)
    .maybeSingle();

  if (!person) notFound();

  const [{ data: statuses }, { data: requests }, { data: trees }, { data: notes }] = await Promise.all([
    supabase.from("lead_statuses").select("id, label_ar, sort_order").eq("is_active", true).order("sort_order"),
    supabase
      .from("interest_requests")
      .select(
        "id, request_no, created_at, request_kind, project_name, offer_trees, tree_count_label_ar, desired_area_label_ar, spacing_label_ar, area_per_tree_m2, total_area_m2, payment_mode, total_price_millimes, down_payment_percent, down_payment_amount_millimes, monthly_millimes, duration_label_ar, duration_months, budget_label_ar, priority_label_ar, goal_label_ar, down_payment_label_ar, installment_label_ar, wants_visit, wants_bank_financing, contact_channel, contact_time_label_ar, residence_governorate_id, invest_governorate_ids, invest_anywhere, scenario_labels",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("trees").select("id, code").eq("held_by", personId).order("code").limit(200),
    supabase
      .from("person_notes")
      .select("id, body, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const { data: govRows } = await supabase.from("governorates").select("id, name_ar");
  const governorates = new Map((govRows ?? []).map((row) => [row.id, row.name_ar]));

  const statusLabel = (statuses ?? []).find((row) => row.id === person.status_id)?.label_ar ?? "—";
  const held = trees ?? [];
  const digits = person.phone_e164 ? person.phone_e164.replace(/[^0-9]/g, "") : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="section-title">{person.full_name ?? "بلا اسم"}</h1>
        <Link href="/admin/v2/files" className="text-sm text-muted hover:text-forest">
          رجوع للملفات
        </Link>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <a dir="ltr" href={`tel:${person.phone_e164 ?? ""}`} className="font-semibold text-forest">
          {person.phone_e164 ?? "—"}
        </a>
        <span className="pill">{statusLabel}</span>
        {digits ? (
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm ms-auto"
          >
            واتساب
          </a>
        ) : null}
      </div>

      {/* The act, above the history: a file you cannot advance from is a report. The sale needs a CIN, so a
          file without one says what is missing instead of failing at the last screen. */}
      {person.cin ? (
        <Link href={`/admin/v2/files/${person.id}/sell`} className="btn btn-primary w-full sm:w-auto">
          بيع — احجزلو زيتونات
        </Link>
      ) : (
        <p className="card border-gold/40 p-4 text-sm text-muted">
          باش تبيعلو، لازم أوّلاً رقم بطاقة التعريف متاعو.
        </p>
      )}

      <FileActions
        personId={person.id}
        statuses={statuses ?? []}
        currentStatusId={person.status_id}
        identity={{
          cin: person.cin,
          cin_issued_on: person.cin_issued_on,
          birth_date: person.birth_date,
          birth_place: person.birth_place,
          address_line: person.address_line,
        }}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">الزيتونات متاعو ({formatCount(held.length)})</h2>
        {held.length === 0 ? (
          <p className="card p-4 text-sm text-muted">مازال ما تعيّنتلو حتّى زيتونة.</p>
        ) : (
          <ul className="card flex flex-wrap gap-1.5 p-4">
            {held.map((tree) => (
              <li key={tree.id} dir="ltr" className="pill">
                {tree.code}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">الطلبات</h2>
        {(requests ?? []).length === 0 ? (
          <p className="card p-4 text-sm text-muted">ما عندو حتّى طلب.</p>
        ) : (
          <ul className="grid gap-3">
            {(requests ?? []).map((request) => (
              <li key={request.id}>
                <RequestCard request={request as unknown as RequestDetails} governorates={governorates} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {(notes ?? []).length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">الملاحظات</h2>
          <ul className="grid gap-2">
            {(notes ?? []).map((note) => (
              <li key={note.id} className="card p-3 text-sm">
                <p className="text-ink">{note.body}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(note.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
