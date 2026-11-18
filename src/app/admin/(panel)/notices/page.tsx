import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { saveNotice } from "./actions";
import { StatusButtons } from "./status-buttons";

export const metadata: Metadata = { title: "إشعارات الموقع" };

/**
 * إشعارات الموقع (0174, owner 2026-11-18: «نحب notifications يخرجولو وقت اللي يحل الانترفاس نتاع السيت»). What a
 * visitor finds in the bell when they open the site: «جديد على AgriZed» for each new offer (drafted by itself when
 * an offer is published), the follow-up after a registration (day 1, 4, 10, 20…, stopped once someone holds
 * trees), and anything written here. Nothing is sent to a phone. A draft is invisible until it is published.
 */

type Notice = {
  id: string;
  kind: "offer" | "journey" | "news" | "custom";
  locale: string;
  title: string;
  body: string | null;
  link: string | null;
  cta: string | null;
  image: string | null;
  audience: "everyone" | "registered" | "holders";
  after_days: number | null;
  pop: boolean;
  status: "draft" | "published" | "archived";
  project_code: string | null;
  published_at: string | null;
  created_at: string;
  reads: number;
  dismissed: number;
};

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const KIND: Record<Notice["kind"], string> = { offer: "عرض جديد", journey: "متابعة بعد التسجيل", news: "خبر", custom: "إشعار" };
const AUDIENCE: Record<Notice["audience"], string> = {
  everyone: "كل الزوّار",
  registered: "اللي سجّلو برك",
  holders: "اللي عندهم زيتون",
};
const STATUS: Record<Notice["status"], { label: string; tone: "warning" | "success" | "neutral" }> = {
  draft: { label: "مسودّة", tone: "warning" },
  published: { label: "منشور", tone: "success" },
  archived: { label: "مؤرشف", tone: "neutral" },
};

export default async function NoticesPage() {
  await requireStaff(ADMIN_ROLES);
  const [config, supabase] = await Promise.all([getPublicConfig(), createClient()]);
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const [{ data, error }, offers] = await Promise.all([
    rpc("staff_site_notices"),
    supabase.from("projects").select("code, name").eq("status", "published").order("created_at", { ascending: false }),
  ]);
  if (error) console.error("staff_site_notices failed", error.message);

  const payload = (data ?? { notices: [], known_browsers: 0 }) as { notices: Notice[]; known_browsers: number };
  const notices = payload.notices ?? [];
  const journey = notices.filter((notice) => notice.kind === "journey");
  const others = notices.filter((notice) => notice.kind !== "journey");

  // The links the site has, offered as suggestions: any path on the site is accepted.
  const links = [
    "/",
    "/start",
    "/projects",
    "/zitounti",
    "/abroad",
    ...(offers.data ?? []).map((offer) => `/projects/${offer.code}`),
    ...optionsFor(config, "tree_for").flatMap((option) => (option.code ? [`/story/${option.code}`] : [])),
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        level={1}
        title="إشعارات الموقع"
        description="يبانو للزائر في الجرس 🔔 كي يحلّ الموقع، وكارت صغيرة مرّة في الزيارة. ما يتبعث حتى شيء للتلفون. المسودّة ما تبانش حتى تنشرها."
      />

      <p className="text-sm text-muted">
        المتصفّحات اللي نعرفو مولاها (سجّل طلب): <strong className="tabular-nums text-ink">{payload.known_browsers ?? 0}</strong>
      </p>

      <datalist id="notice-links">
        {links.map((link) => (
          <option key={link} value={link} />
        ))}
      </datalist>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-forest">إشعار جديد</h2>
        <NoticeForm />
      </section>

      <NoticeList title="المتابعة بعد التسجيل (تتوقّف وحدها كي يشري)" notices={journey} />
      <NoticeList title="العروض والأخبار" notices={others} />
    </div>
  );
}

function NoticeList({ title, notices }: { title: string; notices: Notice[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-forest">
        {title} <span className="tabular-nums text-muted">{notices.length}</span>
      </h2>
      {notices.length === 0 ? (
        <EmptyState>ما فمّا حتى إشعار هوني.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li key={notice.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={STATUS[notice.status].tone}>{STATUS[notice.status].label}</StatusPill>
                <span className="text-sm font-semibold text-ink">{KIND[notice.kind]}</span>
                <span className="text-xs text-muted">
                  {notice.kind === "journey" ? `بعد ${notice.after_days} يوم من التسجيل` : AUDIENCE[notice.audience]}
                  {notice.pop ? " · كارت عند الوصول" : ""}
                </span>
                <span className="ms-auto text-[0.6875rem] text-muted">
                  {notice.published_at ? `منشور ${formatDateTime(notice.published_at)}` : formatDateTime(notice.created_at)}
                  {notice.status === "published" ? ` · تقرا ${notice.reads} · تخبّى ${notice.dismissed}` : ""}
                </span>
              </div>
              <p className="font-display text-base font-bold text-forest">{notice.title}</p>
              {notice.body ? <p className="text-sm leading-6">{notice.body}</p> : null}
              {notice.link ? (
                <p dir="ltr" className="text-[0.6875rem] text-muted">
                  {notice.cta ? `«${notice.cta}» → ` : ""}
                  {notice.link}
                </p>
              ) : null}

              <StatusButtons id={notice.id} status={notice.status} />

              <details className="rounded-xl bg-paper px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-forest">بدّل</summary>
                <div className="mt-3">
                  <NoticeForm notice={notice} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoticeForm({ notice }: { notice?: Notice }) {
  const journey = notice?.kind === "journey";
  return (
    <ActionForm action={saveNotice} submitLabel={notice ? "سجّل التبديل" : "سجّل كمسودّة"} className="card space-y-3 p-4">
      {notice ? <input type="hidden" name="id" value={notice.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {notice ? (
          <input type="hidden" name="kind" value={notice.kind} />
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">النوع</span>
            <select name="kind" defaultValue="news" className="field field-sm w-full">
              <option value="news">خبر / إشعار</option>
              <option value="journey">متابعة بعد التسجيل</option>
            </select>
          </label>
        )}
        {journey || !notice ? (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">بعد كم يوم من التسجيل (للمتابعة)</span>
            <input name="after_days" type="number" min={0} max={365} defaultValue={notice?.after_days ?? ""} className="field field-sm w-full" />
          </label>
        ) : null}
        {!journey ? (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">لشكون</span>
            <select name="audience" defaultValue={notice?.audience ?? "everyone"} className="field field-sm w-full">
              <option value="everyone">كل الزوّار</option>
              <option value="registered">اللي سجّلو برك</option>
              <option value="holders">اللي عندهم زيتون</option>
            </select>
          </label>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-semibold">العنوان</span>
        <input name="title" required maxLength={90} defaultValue={notice?.title ?? ""} className="field field-sm w-full" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-semibold">النص (حتى 400 حرف، بلا وعد بربح)</span>
        <textarea name="body" maxLength={400} rows={3} defaultValue={notice?.body ?? ""} className="field min-h-20 w-full" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm font-semibold">الرابط (صفحة من الموقع)</span>
          <input name="link" dir="ltr" list="notice-links" defaultValue={notice?.link ?? ""} placeholder="/start" className="field field-sm w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">اسم الزرّ</span>
          <input name="cta" maxLength={40} defaultValue={notice?.cta ?? ""} placeholder="احسب زيتونتك" className="field field-sm w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">تصويرة (رابط https، اختياري)</span>
          <input name="image" dir="ltr" defaultValue={notice?.image ?? ""} className="field field-sm w-full" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pop" defaultChecked={notice?.pop ?? false} /> يطلع كارت مرّة كي يجي الزائر (موش كان في الجرس)
      </label>
    </ActionForm>
  );
}
