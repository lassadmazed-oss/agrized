import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDateTime } from "@/lib/format";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "سجل العمليات" };

const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  auth: "الدخول",
  persons: "الحرفاء",
  interest_requests: "مطالب الاستثمار",
  person_assignments: "إسناد الملفات",
  land_offers: "عروض الأراضي",
  land_offer_reviews: "مراجعات العروض",
  land_offer_files: "ملفات العروض",
  settings: "الإعدادات",
  feature_flags: "الموديولات",
  option_items: "القوائم",
  project_types: "أنواع المشاريع",
  lead_statuses: "حالات الملفات",
  message_templates: "قوالب الرسائل",
  user_roles: "الأدوار",
  profiles: "المستخدمون",
  governorates: "الولايات",
  delegations: "المعتمديات",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "إضافة",
  update: "تعديل",
  delete: "حذف",
  "auth.login": "دخول",
  "auth.login_failed": "محاولة دخول فاشلة",
  "auth.login_denied": "دخول مرفوض (بدون صلاحية)",
  "auth.logout": "خروج",
  "auth.password_changed": "تغيير كلمة السر",
  "auth.password_reset": "إعادة تعيين كلمة السر",
  "crm.export": "تصدير المطالب",
  "document.open": "فتح وثيقة",
};

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pick(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

function changedFields(oldData: Json | null, newData: Json | null): { key: string; before: string; after: string }[] {
  const before = (oldData && typeof oldData === "object" && !Array.isArray(oldData) ? oldData : {}) as Record<string, Json>;
  const after = (newData && typeof newData === "object" && !Array.isArray(newData) ? newData : {}) as Record<string, Json>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => key !== "updated_at" && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  const show = (value: Json | undefined) => (value === undefined || value === null ? "—" : typeof value === "string" ? value : JSON.stringify(value));
  return keys.map((key) => ({ key, before: show(before[key]), after: show(after[key]) }));
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff(ADMIN_ROLES);
  const params = await searchParams;
  const entity = pick(params.entity);
  const action = pick(params.action);
  const actor = pick(params.actor);
  const from = pick(params.from);
  const to = pick(params.to);
  const page = Math.max(1, Number.parseInt(pick(params.page) ?? "1", 10) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_id, action, entity, entity_id, old_data, new_data, reason, ip", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (entity && entity in ENTITY_LABELS) query = query.eq("entity", entity);
  if (action && action in ACTION_LABELS) query = query.eq("action", action);
  if (actor && UUID.test(actor)) query = query.eq("actor_id", actor);
  if (from && DATE.test(from)) query = query.gte("occurred_at", `${from}T00:00:00+01:00`);
  if (to && DATE.test(to)) query = query.lte("occurred_at", `${to}T23:59:59+01:00`);

  const [{ data: logs, count, error }, { data: profiles }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  if (error) throw new Error(error.message);

  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ entity, action, actor, from, to })) if (value) query.set(key, value);
    query.set("page", String(target));
    return `/admin/audit?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-bold text-forest">سجل العمليات</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">من قام بالعملية، متى، وماذا تغيّر. السجل لا يُعدَّل ولا يُحذف.</p>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select name="entity" defaultValue={entity ?? ""} className="field" aria-label="الكيان">
          <option value="">كل الكيانات</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action ?? ""} className="field" aria-label="العملية">
          <option value="">كل العمليات</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="actor" defaultValue={actor ?? ""} className="field" aria-label="المستخدم">
          <option value="">كل المستخدمين</option>
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={from} className="field" dir="ltr" aria-label="من تاريخ" />
        <input type="date" name="to" defaultValue={to} className="field" dir="ltr" aria-label="إلى تاريخ" />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary flex-1">
            بحث
          </button>
          <Link href="/admin/audit" className="btn btn-ghost">
            مسح
          </Link>
        </div>
      </form>

      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">{formatCount(total)}</span> عملية
      </p>

      <ul className="space-y-2">
        {(logs ?? []).map((log) => {
          const changes = log.action === "update" ? changedFields(log.old_data, log.new_data) : [];
          return (
            <li key={log.id} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-semibold">{ACTION_LABELS[log.action] ?? log.action}</span>
                  <span className="text-muted"> · {ENTITY_LABELS[log.entity] ?? log.entity}</span>
                  {log.entity_id ? (
                    <span dir="ltr" className="text-xs text-muted">
                      {" "}
                      {log.entity_id.slice(0, 8)}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted tabular-nums">
                  {formatDateTime(log.occurred_at)} · {log.actor_id ? (names.get(log.actor_id) ?? "مستخدم") : "زائر / النظام"}
                  {log.ip ? (
                    <span dir="ltr">
                      {" · "}
                      {log.ip}
                    </span>
                  ) : null}
                </p>
              </div>
              {log.reason ? <p className="mt-1 text-muted">السبب: {log.reason}</p> : null}
              {changes.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-xs">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-1 text-start font-semibold">الحقل</th>
                        <th className="py-1 text-start font-semibold">قبل</th>
                        <th className="py-1 text-start font-semibold">بعد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {changes.map((change) => (
                        <tr key={change.key} className="align-top">
                          <td dir="ltr" className="py-1 pe-3 text-start font-mono">
                            {change.key}
                          </td>
                          <td className="max-w-64 break-words py-1 pe-3 text-muted">{change.before}</td>
                          <td className="max-w-64 break-words py-1">{change.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : log.new_data || log.old_data ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-forest">التفاصيل</summary>
                  <pre dir="ltr" className="mt-2 max-h-64 overflow-auto rounded-lg bg-paper p-3 text-left text-xs">
                    {JSON.stringify(log.new_data ?? log.old_data, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>

      {pageCount > 1 ? (
        <nav aria-label="الصفحات" className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-secondary">
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted tabular-nums">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="btn btn-secondary">
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
