import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import {
  ATTEMPT_CHANNEL_LABELS,
  CHANNEL_LABELS,
  OUTCOME_LABELS,
  PLANTATION_LABELS,
  PRODUCTION_LABELS,
  STAGE_TONES,
} from "@/lib/crm";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { addContactAttempt, addNote, assignPerson, updateStatus } from "./actions";

export const metadata: Metadata = { title: "ملف حريف" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TimelineEntry = { at: string; kind: string; title: string; detail?: string | null; by?: string | null };

export default async function LeadDetailPage({ params }: PageProps<"/admin/leads/[personId]">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const { personId } = await params;
  if (!UUID.test(personId)) notFound();

  const isAdmin = hasRole(session, ADMIN_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();

  const { data: person } = await supabase
    .from("persons")
    .select(
      "id, full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, created_at, assigned_to, status:lead_statuses(id, stage, label_ar), owner:profiles!persons_assigned_to_fkey(full_name)",
    )
    .eq("id", personId)
    .maybeSingle();
  if (!person) notFound();

  const canEdit = isAdmin || (hasRole(session, ["commercial"]) && person.assigned_to === session.id);

  const [requests, attempts, notes, history, assignments, statuses, commercials, whatsappTemplate] = await Promise.all([
    supabase.from("interest_requests").select("*").eq("person_id", personId).order("created_at", { ascending: false }),
    supabase
      .from("contact_attempts")
      .select("id, channel, outcome, note, next_follow_up_at, created_at, author:profiles!contact_attempts_created_by_fkey(full_name)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_notes")
      .select("id, body, created_at, author:profiles!person_notes_created_by_fkey(full_name)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_status_history")
      .select(
        "id, created_at, from:lead_statuses!person_status_history_from_status_id_fkey(label_ar), to:lead_statuses!person_status_history_to_status_id_fkey(label_ar), author:profiles!person_status_history_changed_by_fkey(full_name)",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_assignments")
      .select(
        "id, reason, created_at, from:profiles!person_assignments_from_user_fkey(full_name), to:profiles!person_assignments_to_user_fkey(full_name), author:profiles!person_assignments_created_by_fkey(full_name)",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("id, label_ar").eq("is_active", true).order("sort_order"),
    isAdmin
      ? supabase
          .from("user_roles")
          .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name, is_active)")
          .eq("role", "commercial")
      : Promise.resolve({ data: [] as { user_id: string; profile: { full_name: string; is_active: boolean } | null }[] }),
    supabase.from("message_templates").select("body_ar").eq("key", "lead.whatsapp_first_contact").eq("is_active", true).maybeSingle(),
  ]);

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const typeName = new Map(config.projectTypes.map((t) => [t.id, t.label_ar]));
  const latestRequest = requests.data?.[0];

  const whatsappNumber = (person.whatsapp_e164 ?? person.phone_e164).replace(/\D/g, "");
  const whatsappText = whatsappTemplate.data?.body_ar
    ?.replace("{name}", person.full_name.split(" ")[0] ?? person.full_name)
    .replace("{agent}", session.fullName || "فريق AgriZed")
    .replace("{request_no}", latestRequest?.request_no ?? "");
  const whatsappHref = `https://wa.me/${whatsappNumber}${whatsappText ? `?text=${encodeURIComponent(whatsappText)}` : ""}`;

  const timeline: TimelineEntry[] = [
    ...(attempts.data ?? []).map((a) => ({
      at: a.created_at,
      kind: "محاولة تواصل",
      title: `${ATTEMPT_CHANNEL_LABELS[a.channel] ?? a.channel} · ${OUTCOME_LABELS[a.outcome]}`,
      detail: [a.note, a.next_follow_up_at ? `متابعة: ${formatDateTime(a.next_follow_up_at)}` : null].filter(Boolean).join(" — "),
      by: a.author?.full_name,
    })),
    ...(notes.data ?? []).map((n) => ({ at: n.created_at, kind: "ملاحظة", title: n.body, by: n.author?.full_name })),
    ...(history.data ?? []).map((h) => ({
      at: h.created_at,
      kind: "الحالة",
      title: h.from ? `${h.from.label_ar} ← ${h.to?.label_ar}` : `بداية الملف: ${h.to?.label_ar}`,
      by: h.author?.full_name ?? "النظام",
    })),
    ...(assignments.data ?? []).map((a) => ({
      at: a.created_at,
      kind: "الإسناد",
      title: `${a.from?.full_name ?? "بدون مسؤول"} ← ${a.to?.full_name ?? "بدون مسؤول"}`,
      detail: a.reason === "auto:round_robin" ? "إسناد آلي بالتناوب" : a.reason,
      by: a.author?.full_name ?? "النظام",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <Link href="/admin/leads" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → مطالب الاستثمار
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-forest sm:text-4xl">{person.full_name}</h1>
            {person.status ? (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STAGE_TONES[person.status.stage]}`}>
                {person.status.label_ar}
              </span>
            ) : null}
          </div>
          <p className="text-muted">
            {[delegationName.get(person.delegation_id ?? -1), governorateName.get(person.governorate_id ?? -1)].filter(Boolean).join("، ")}
            {person.email ? (
              <>
                {" · "}
                <span dir="ltr">{person.email}</span>
              </>
            ) : null}
          </p>
          <p className="text-sm text-muted">
            المسؤول: <span className="font-semibold text-ink">{person.owner?.full_name ?? "بدون مسؤول"}</span> · ملف منذ{" "}
            <span className="tabular-nums">{formatDateTime(person.created_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${person.phone_e164}`} className="btn btn-primary" dir="ltr">
            {formatPhone(person.phone_e164)}
          </a>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            WhatsApp
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">المطالب ({requests.data?.length ?? 0})</h2>
            {(requests.data ?? []).map((request) => (
              <article key={request.id} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p dir="ltr" className="font-semibold text-forest tabular-nums">
                    {request.request_no}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted tabular-nums">
                    {request.is_duplicate ? <span className="rounded bg-gold-soft px-1.5 py-0.5 text-xs text-forest-700">مكرّر</span> : null}
                    {formatDateTime(request.created_at)}
                  </p>
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Item label="عدد الزيتونات">
                    <span className="tabular-nums">{request.tree_count_label_ar ?? "بدون إجابة"}</span>
                  </Item>
                  <Item label="مكان الاستثمار">
                    {request.invest_anywhere
                      ? "المكان غير مهم"
                      : request.invest_governorate_ids.map((id) => governorateName.get(id) ?? id).join("، ")}
                  </Item>
                  <Item label="يحب يملك">
                    {request.scenario_labels.length > 0
                      ? request.scenario_labels.join("، ")
                      : request.project_type_unsure
                        ? "ما يهمّوش النوع، يطلب اقتراحاً"
                        : request.project_type_ids.map((id) => typeName.get(id) ?? "—").join("، ")}
                    {request.plantation_systems.length > 0 || request.production_statuses.length > 0 ? (
                      <span className="mt-0.5 block text-sm font-normal text-muted">
                        {[
                          request.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join("، "),
                          request.production_statuses.map((code) => PRODUCTION_LABELS[code] ?? code).join("، "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </Item>
                  <Item label="المساحة المطلوبة">{request.desired_area_label_ar ?? "بدون تفضيل"}</Item>
                  <Item label="الأهم بالنسبة إليه">{request.priority_label_ar ?? "—"}</Item>
                  <Item label="الهدف">{request.goal_label_ar}</Item>
                  <Item label="التسبقة / القسط">
                    <span className="tabular-nums">
                      {request.down_payment_label_ar} / {request.installment_label_ar} شهرياً
                    </span>
                  </Item>
                  <Item label="التواصل">
                    {CHANNEL_LABELS[request.contact_channel]}
                    {request.contact_time_label_ar ? ` · ${request.contact_time_label_ar}` : " · أي وقت"}
                  </Item>
                  <Item label="الإقامة المصرّح بها">
                    {[
                      request.residence_delegation_id ? delegationName.get(request.residence_delegation_id) : null,
                      governorateName.get(request.residence_governorate_id),
                    ]
                      .filter(Boolean)
                      .join("، ")}
                  </Item>
                  {request.full_name !== person.full_name ? <Item label="الاسم في هذا المطلب">{request.full_name}</Item> : null}
                  <Item label="المصدر">
                    <span dir="ltr">{(request.source as { utm_source?: string } | null)?.utm_source ?? "direct"}</span>
                  </Item>
                </dl>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">سجل الملف</h2>
            {timeline.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center text-muted">لا توجد عمليات بعد.</p>
            ) : (
              <ol className="space-y-0 rounded-2xl border border-line bg-surface">
                {timeline.map((entry, index) => (
                  <li key={`${entry.kind}-${entry.at}-${index}`} className="border-b border-line px-5 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-gold">{entry.kind}</p>
                      <p className="text-xs text-muted tabular-nums">
                        {formatDateTime(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ""}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-ink">{entry.title}</p>
                    {entry.detail ? <p className="mt-1 text-sm text-muted">{entry.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {canEdit ? (
            <>
              <Panel title="تسجيل محاولة تواصل">
                <ActionForm action={addContactAttempt.bind(null, person.id)} submitLabel="تسجيل">
                  <div className="grid grid-cols-2 gap-2">
                    <select name="channel" className="field" defaultValue="phone" aria-label="القناة">
                      {Object.entries(ATTEMPT_CHANNEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select name="outcome" className="field" defaultValue="" aria-label="النتيجة" required>
                      <option value="" disabled>
                        النتيجة
                      </option>
                      {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea name="note" rows={2} maxLength={5000} placeholder="ملاحظة (اختياري)" className="field min-h-20" />
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">موعد المتابعة (اختياري)</span>
                    <input type="datetime-local" name="next_follow_up_at" className="field" dir="ltr" />
                  </label>
                </ActionForm>
              </Panel>

              <Panel title="الحالة">
                <ActionForm action={updateStatus.bind(null, person.id)} submitLabel="حفظ الحالة" buttonClassName="btn btn-secondary">
                  <select name="status_id" defaultValue={person.status?.id ?? ""} className="field" aria-label="حالة الملف">
                    {(statuses.data ?? []).map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label_ar}
                      </option>
                    ))}
                  </select>
                </ActionForm>
              </Panel>

              <Panel title="ملاحظة">
                <ActionForm action={addNote.bind(null, person.id)} submitLabel="إضافة" buttonClassName="btn btn-secondary">
                  <textarea name="body" rows={3} maxLength={5000} required className="field min-h-24" aria-label="الملاحظة" />
                </ActionForm>
              </Panel>
            </>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">اطلاع فقط: لا يمكنك تعديل هذا الملف.</p>
          )}

          {isAdmin ? (
            <Panel title="تحويل الملف">
              <ActionForm action={assignPerson.bind(null, person.id)} submitLabel="تحويل" buttonClassName="btn btn-secondary">
                <select name="to_user" defaultValue={person.assigned_to ?? "none"} className="field" aria-label="الـCommercial">
                  <option value="none">بدون مسؤول</option>
                  {(commercials.data ?? [])
                    .filter((c) => c.profile?.is_active)
                    .map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.profile?.full_name || "—"}
                      </option>
                    ))}
                </select>
                <input name="reason" maxLength={500} placeholder="السبب (مثال: مغادرة الموظف)" className="field" />
              </ActionForm>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
