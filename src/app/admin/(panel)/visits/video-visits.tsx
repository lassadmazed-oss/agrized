import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { setVideoVisit } from "./video-actions";

const STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" }> = {
  requested: { label: "تستنّى تأكيد", tone: "warning" },
  confirmed: { label: "مؤكّدة", tone: "info" },
  done: { label: "تمّت", tone: "success" },
  cancelled: { label: "تلغات", tone: "neutral" },
};

const LANGUAGE: Record<string, string> = { ar: "العربية", fr: "Français", de: "Deutsch", it: "Italiano", en: "English" };

type Row = {
  id: string;
  request_no: string;
  person_id: string;
  full_name: string;
  whatsapp_e164: string;
  country_code: string | null;
  time_zone: string;
  locale: string | null;
  preferred_at: string;
  scheduled_at: string | null;
  status: string;
  client_note: string | null;
  staff_note: string | null;
  created_at: string;
  project: { name: string; code: string | null } | null;
};

/**
 * «زيارات بالفيديو — من برّا» (0130): the live video visits booked from /abroad, on the visits board where the
 * team already plans its days. A call is a person far away waiting on a time they chose on their own clock, so
 * each card says the time twice — Tunisian time, which is when someone has to be in the grove with a phone, and
 * the client's, which is what to write to them — plus the WhatsApp to write on and the language to write in.
 *
 * Read through RLS: a commercial sees the requests of their own files, as on the rest of this board.
 */
export async function VideoVisits() {
  const supabase = await createClient();
  const select =
    "id, request_no, person_id, full_name, whatsapp_e164, country_code, time_zone, locale, preferred_at, scheduled_at, status, client_note, staff_note, created_at, project:projects(name, code)";
  const [open, closed] = await Promise.all([
    supabase.from("video_visit_requests").select(select).in("status", ["requested", "confirmed"]).order("preferred_at").limit(60),
    supabase.from("video_visit_requests").select(select).in("status", ["done", "cancelled"]).order("updated_at", { ascending: false }).limit(10),
  ]);
  if (open.error || closed.error) {
    console.error("video_visit_requests read failed", open.error ?? closed.error);
    return null;
  }
  const rows = (open.data ?? []) as unknown as Row[];
  const past = (closed.data ?? []) as unknown as Row[];
  const waiting = rows.filter((row) => row.status === "requested").length;

  return (
    <section className="space-y-snug">
      <SectionHeader
        as="h2"
        title="زيارات بالفيديو — من برّا"
        description={
          rows.length > 0
            ? `${rows.length} زيارة مفتوحة، منها ${waiting} تستنّى تأكيد. أكّد الوقت مع الحريف على واتساب، ثم سجّلو هنا.`
            : "الحرفاء اللي عايشين برّا يحجزو من صفحة /abroad: واحد من الفريق يمشي بيهم في الضيعة في مكالمة فيديو على واتساب."
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="ما فماش زيارة بالفيديو مفتوحة" size="sm" variant="plain">
          كي يحجز حريف من برّا، الطلب يظهر هنا بالوقت متاعو وبتوقيت تونس.
        </EmptyState>
      ) : (
        <div className="grid gap-snug lg:grid-cols-2">
          {rows.map((row) => (
            <VideoCard key={row.id} row={row} />
          ))}
        </div>
      )}
      {past.length > 0 ? (
        <details className="disclosure">
          <summary className="text-sm text-forest">آخر {past.length} زيارات توفّات</summary>
          <div className="mt-tight grid gap-snug lg:grid-cols-2">
            {past.map((row) => (
              <VideoCard key={row.id} row={row} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function VideoCard({ row }: { row: Row }) {
  const at = row.scheduled_at ?? row.preferred_at;
  const status = STATUS[row.status] ?? STATUS.requested;
  const local = clientTime(at, row.time_zone);
  return (
    <article className="card p-cozy">
      <div className="flex flex-wrap items-start justify-between gap-tight">
        <div>
          <p className="flex flex-wrap items-baseline gap-tight">
            <Link href={`/admin/leads/${row.person_id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
              {row.full_name}
            </Link>
            {row.country_code ? <span className="text-sm text-muted">{flag(row.country_code)} {row.country_code}</span> : null}
          </p>
          <a
            href={`https://wa.me/${row.whatsapp_e164.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="text-sm font-semibold tabular-nums text-[#128c4a] underline-offset-4 hover:underline"
          >
            WhatsApp {formatPhone(row.whatsapp_e164)}
          </a>
        </div>
        <div className="flex flex-col items-end gap-hair">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <span dir="ltr" className="text-xs text-muted">
            {row.request_no}
          </span>
        </div>
      </div>

      <dl className="mt-tight grid gap-x-cozy gap-y-hair text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{row.scheduled_at ? "الموعد المؤكّد (تونس)" : "الوقت اللي اختارو (تونس)"}</dt>
          <dd className="font-semibold">{formatDateTime(at)}</dd>
        </div>
        <div>
          <dt className="text-muted">عند الحريف</dt>
          <dd className="font-semibold">
            {local} <span className="text-xs font-normal text-muted" dir="ltr">({row.time_zone})</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">الضيعة</dt>
          <dd>{row.project ? row.project.name : "ما اختارش — وريه اللي عندنا"}</dd>
        </div>
        <div>
          <dt className="text-muted">لغة الحريف</dt>
          <dd>{LANGUAGE[row.locale ?? "ar"] ?? row.locale}</dd>
        </div>
      </dl>
      {row.client_note ? <p className="mt-tight rounded-lg bg-paper px-3 py-2 text-sm leading-6">«{row.client_note}»</p> : null}

      <details className="disclosure mt-tight">
        <summary className="text-sm text-forest">أكّد ولا بدّل الحالة</summary>
        <ActionForm action={setVideoVisit} submitLabel="احفظ" className="mt-tight space-y-snug" buttonClassName="btn btn-primary btn-sm">
          <input type="hidden" name="id" value={row.id} />
          <div className="grid gap-snug sm:grid-cols-2">
            <label className="block space-y-hair">
              <span className="label-sm">الحالة</span>
              <select name="status" defaultValue={row.status === "requested" ? "confirmed" : row.status} className="field field-sm">
                {Object.entries(STATUS).map(([code, item]) => (
                  <option key={code} value={code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-hair">
              <span className="label-sm">الموعد بتوقيت تونس</span>
              <input type="datetime-local" name="scheduled_at" defaultValue={tunisWall(at)} className="field field-sm" dir="ltr" />
            </label>
          </div>
          <label className="block space-y-hair">
            <span className="label-sm">ملاحظة الفريق</span>
            <textarea name="staff_note" rows={2} maxLength={1000} defaultValue={row.staff_note ?? ""} className="field field-sm min-h-16 py-2" />
          </label>
        </ActionForm>
      </details>
    </article>
  );
}

/** «الإثنين 12/10 · 13:00» on the client's own clock; the zone as stored when the browser named one we cannot read. */
function clientTime(at: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat("ar-TN-u-nu-latn", {
      timeZone: zone,
      weekday: "long",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));
  } catch {
    return "—";
  }
}

/** The instant as Tunisian wall time, «2026-10-12T14:00», for a datetime-local field. */
function tunisWall(at: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** «FR» → 🇫🇷 (where the system draws flags; Windows prints the two letters, which still read). */
function flag(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
