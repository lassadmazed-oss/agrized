import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { DataTable, EmptyState, SectionHeader, StatTile, type Column } from "@/components/ui";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import {
  asPushStaffClient,
  AUDIENCE_LABELS,
  routeLabel,
  STATUS_LABELS,
  type PushCampaignRow,
  type PushCampaignStatus,
  type PushDevices,
} from "@/lib/backoffice/push-campaigns";
import { formatCount, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { cancelPushCampaign, runCampaignsNow, sendPushCampaign } from "./actions";
import { ComposeForm } from "./compose-form";

export const metadata: Metadata = { title: "إشعارات التطبيق" };

/**
 * إشعارات التطبيق — the notifications the owner writes by hand (0152), and the devices they reach.
 *
 * IT OPENS ON THE FORM, because the reason to come here is to send one: the owner asked for a page where he can
 * test and program notifications «and do a lot in between». Under it, in the order a question comes: how many
 * phones are there to send to, what was sent and what became of it, and which devices registered last.
 *
 * WHAT THE PAGE CANNOT SEE, AND SAYS. A device appears only after somebody opens the app on a real phone and
 * taps «فعّل الإشعارات» in حسابي — Expo Go cannot register one, and neither can the web. With no device the page
 * says so in words that tell the owner what to do, instead of drawing an empty table.
 *
 * NOTHING IS COMPUTED HERE. The counts and the list come from staff_push_devices(), which checks app.is_admin()
 * itself and returns no token and no whole phone number; the history is a plain read under the table's own
 * policy (admins only).
 */

const STATUS_TONE: Record<PushCampaignStatus, PillTone> = {
  scheduled: "info",
  sending: "progress",
  sent: "success",
  failed: "danger",
  cancelled: "neutral",
};

export default async function NotificationsPage() {
  await requireStaff(ADMIN_ROLES);

  const supabase = await createClient();
  const staff = asPushStaffClient(supabase);

  const [devicesRes, campaignsRes, enabledRes, offersRes] = await Promise.all([
    staff.rpc("staff_push_devices"),
    staff.from("push_campaigns").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("settings").select("value").eq("key", "push.enabled").maybeSingle(),
    supabase.rpc("public_projects"),
  ]);

  // Migration 0152 not applied: say which file, as the other modules' pages do, rather than drawing a broken form.
  if (devicesRes.error) {
    return (
      <div className="space-y-4">
        <SectionHeader as="h1" level={1} title="إشعارات التطبيق" />
        <EmptyState title="ما نجمناش نقراو الأجهزة.">
          إذا كانت هذي أول مرة، الملف 0152_push_campaigns.sql مازال ما تركّبش في قاعدة البيانات. شغّل{" "}
          <span dir="ltr">npm run db:migrate</span> ومن بعد حدّث الصفحة.
        </EmptyState>
      </div>
    );
  }

  const devices: PushDevices = devicesRes.data ?? {
    active: 0,
    android: 0,
    ios: 0,
    linked: 0,
    retired: 0,
    last_seen_at: null,
    recent: [],
  };
  const campaigns: PushCampaignRow[] = campaignsRes.data ?? [];
  const pushEnabled = enabledRes.data ? (enabledRes.data.value as unknown) === true : false;

  // The offers the app shows, by the name it shows them under: a notification can open one.
  const offers = ((offersRes.data ?? []) as unknown as { code: string | null; name: string | null }[])
    .filter((offer): offer is { code: string; name: string | null } => Boolean(offer.code))
    .map((offer) => ({ code: offer.code, name: offer.name ?? offer.code }));

  const hasDispatcher = Boolean(process.env.NOTIFY_DISPATCH_SECRET);
  const waiting = campaigns.filter((campaign) => campaign.status === "scheduled" || campaign.status === "sending").length;

  const campaignColumns: Column<PushCampaignRow>[] = [
    {
      key: "message",
      header: "الإشعار",
      mobile: "title",
      className: "max-w-80",
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="font-semibold">{row.title}</p>
          <p className="line-clamp-2 text-xs text-muted">{row.body}</p>
        </div>
      ),
    },
    {
      key: "audience",
      header: "لمن",
      cell: (row) => (
        <span>
          {AUDIENCE_LABELS[row.audience]}
          {row.phone_e164 ? <span className="block text-xs text-muted" dir="ltr">{formatPhone(row.phone_e164)}</span> : null}
        </span>
      ),
    },
    { key: "route", header: "يفتح", cell: (row) => <span className="text-sm">{routeLabel(row.route)}</span> },
    {
      key: "when",
      header: "الوقت",
      cell: (row) => (
        <span className="text-sm">
          {formatDateTime(row.status === "sent" && row.sent_at ? row.sent_at : row.scheduled_at)}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      mobile: "aside",
      cell: (row) => (
        <div className="space-y-1">
          <StatusPill tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</StatusPill>
          {row.status === "sent" || row.failed_count > 0 ? (
            <p className="text-xs text-muted">
              وصل لـ {formatCount(row.sent_count)}
              {row.failed_count > 0 ? ` · رفض ${formatCount(row.failed_count)}` : ""}
            </p>
          ) : null}
          {row.error ? <p className="max-w-56 text-xs text-danger">{row.error}</p> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      mobile: "meta",
      cell: (row) =>
        row.status === "scheduled" ? (
          <ActionForm
            action={cancelPushCampaign.bind(null, row.id)}
            submitLabel="ألغِ"
            pendingLabel="…"
            className="inline"
            buttonClassName="btn btn-secondary btn-sm"
          >
            <></>
          </ActionForm>
        ) : null,
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        level={1}
        title="إشعارات التطبيق"
        description="اكتب إشعار وابعثو لتلفونك باش تجرّبو، ولا للكل. تنجّم تبرمجو لوقت جاي، وتختار الشاشة اللي يفتحها كي يضغط عليه الحريف."
      />

      {/* ── the devices ─────────────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="أجهزة نشيطة"
          value={devices.active}
          note={devices.last_seen_at ? `آخر ظهور ${formatDateTime(devices.last_seen_at)}` : "ما فمّاش حتى جهاز مسجّل."}
          quiet={devices.active === 0}
          size="sm"
        />
        <StatTile label="أندرويد" value={devices.android} size="sm" quiet={devices.android === 0} />
        <StatTile label="آيفون" value={devices.ios} size="sm" quiet={devices.ios === 0} />
        <StatTile
          label="مربوطة برقم"
          value={devices.linked}
          note="الباقي زوّار فتحو التطبيق قبل ما يبعثو مطلب."
          size="sm"
          quiet={devices.linked === 0}
        />
      </div>

      {devices.active === 0 ? (
        <EmptyState title="مازال ما فمّاش جهاز يوصلو إشعار.">
          جهاز يتسجّل كي يفتح واحد التطبيق على تلفون حقيقي (موش Expo Go) ويضغط على «فعّل الإشعارات» في صفحة حسابي. من بعد
          يظهر هنا، وتنجّم تجرّب بـ«آخر جهاز فتح التطبيق».
        </EmptyState>
      ) : null}

      {/* ── write one ───────────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="إشعار جديد" />
        <div className="card p-cozy">
          <ComposeForm action={sendPushCampaign} offers={offers} pushEnabled={pushEnabled} />
        </div>
      </section>

      {/* ── what was sent ───────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="اللي تبعث"
          description={`${formatCount(campaigns.length)} إشعار آخر${waiting > 0 ? ` · ${formatCount(waiting)} يستنّى` : ""}`}
          actions={
            <ActionForm
              action={runCampaignsNow}
              submitLabel="شغّل الإرسال توّا"
              pendingLabel="جارٍ الإرسال…"
              className="flex flex-wrap items-center gap-3"
              buttonClassName="btn btn-secondary"
            >
              <></>
            </ActionForm>
          }
        />
        {!hasDispatcher ? (
          <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            الإشعار اللي تبرمجو لوقت جاي ما يخرجش وحدو حتى يتضبط <span dir="ltr">NOTIFY_DISPATCH_SECRET</span> وواحد
            يعيّط على <span dir="ltr">/api/notifications/dispatch</span> كل بضع دقايق. «ابعث توّا» ما يحتاجش هذا.
          </p>
        ) : null}
        <DataTable
          caption="الإشعارات"
          columns={campaignColumns}
          rows={campaigns}
          rowKey={(row) => row.id}
          minWidth="64rem"
          empty={<EmptyState size="sm">مازال ما بعثت حتى إشعار.</EmptyState>}
        />
      </section>

      {/* ── the latest devices ──────────────────────────────────────────────────────────────────────── */}
      {devices.recent.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="آخر الأجهزة"
            description="المعرّف هو آخر 7 حروف من العنوان الداخلي للجهاز، باش تفرّق بين تلفونين. ما يظهر حتى رمز ولا رقم كامل."
          />
          <DataTable
            caption="آخر الأجهزة"
            columns={[
              { key: "ref", header: "الجهاز", mobile: "title", cell: (row) => <span dir="ltr" className="font-mono text-sm">…{row.ref}</span> },
              { key: "platform", header: "النظام", cell: (row) => (row.platform === "ios" ? "آيفون" : "أندرويد") },
              { key: "version", header: "نسخة التطبيق", cell: (row) => <span dir="ltr">{row.app_version ?? "—"}</span> },
              { key: "phone", header: "الرقم", cell: (row) => <span dir="ltr">{row.phone_hint ?? "غير مربوط"}</span> },
              { key: "seen", header: "آخر ظهور", cell: (row) => formatDateTime(row.last_seen_at) },
            ]}
            rows={devices.recent}
            rowKey={(row) => `${row.ref}-${row.created_at}`}
          />
        </section>
      ) : null}
    </div>
  );
}
