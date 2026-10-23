// إشعارات التطبيق — the words and shapes the Back Office page and its actions share (0152).
//
// Nothing here talks to the database. The page, the actions and the compose form all need the same short lists
// (where a tap may land, who a message may go to) and the same sentences for what the database refuses with, and
// two copies of either is how the form offers a choice the function then rejects.

export type PushAudience = "latest" | "phone" | "all" | "android" | "ios";

/**
 * Who a message may go to, in the order the form draws them — the SAFE one first.
 *
 * `latest` is the default on purpose: the quickest way to see a notification is to send it to the phone that
 * has just opened the app, which is the owner's own, and nothing about it can reach a buyer by accident. The
 * three that DO reach buyers (`all`, `android`, `ios`) ask for a tick before they send.
 */
export const PUSH_AUDIENCES: readonly { value: PushAudience; label: string; hint: string; broadcast: boolean }[] = [
  { value: "latest", label: "آخر جهاز فتح التطبيق (للتجربة)", hint: "تلفونك أنت، كان فتحت التطبيق قبل شوية.", broadcast: false },
  { value: "phone", label: "رقم تلفون معيّن", hint: "كل الأجهزة المسجّلة على الرقم هذا.", broadcast: false },
  { value: "all", label: "كل الأجهزة", hint: "كل تلفون عندو التطبيق وسمح بالإشعارات.", broadcast: true },
  { value: "android", label: "أندرويد برك", hint: "كل أجهزة أندرويد.", broadcast: true },
  { value: "ios", label: "آيفون برك", hint: "كل أجهزة آيفون.", broadcast: true },
];

export const AUDIENCE_LABELS: Record<PushAudience, string> = {
  latest: "آخر جهاز",
  phone: "رقم معيّن",
  all: "كل الأجهزة",
  android: "أندرويد",
  ios: "آيفون",
};

/**
 * Where a tap lands. The values are exactly the ones the app accepts (mobile/src/push.ts, ROUTES), and the
 * database checks the same set (0152): a destination the app would ignore is a tap that goes nowhere. «عرض
 * معيّن» is not a route of its own — the form turns it into /offer/<code> from the offers the app shows.
 */
export const PUSH_ROUTES: readonly { value: string; label: string }[] = [
  { value: "", label: "يفتح التطبيق برك" },
  { value: "/", label: "الرئيسية" },
  { value: "/offers", label: "العروض" },
  { value: "/calculator", label: "احسب مشروعك" },
  { value: "/account", label: "حسابي (زيتونتي)" },
  { value: "/track", label: "وين وصل مطلبك" },
  { value: "offer", label: "عرض معيّن…" },
];

export const ROUTE_LABELS: Record<string, string> = {
  "/": "الرئيسية",
  "/offers": "العروض",
  "/calculator": "احسب مشروعك",
  "/account": "حسابي",
  "/track": "تتبّع المطلب",
};

export function routeLabel(route: string | null): string {
  if (!route) return "يفتح التطبيق";
  if (route.startsWith("/offer/")) return `عرض ${route.slice("/offer/".length)}`;
  return ROUTE_LABELS[route] ?? route;
}

export type PushCampaignStatus = "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export const STATUS_LABELS: Record<PushCampaignStatus, string> = {
  scheduled: "مبرمج",
  sending: "يتبعث",
  sent: "تبعث",
  failed: "فشل",
  cancelled: "ملغى",
};

export type PushCampaignRow = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  route: string | null;
  audience: PushAudience;
  phone_e164: string | null;
  scheduled_at: string;
  status: PushCampaignStatus;
  attempts: number;
  sent_count: number;
  failed_count: number;
  error: string | null;
  sent_at: string | null;
};

/** What `staff_push_devices()` answers. No token and no whole number ever travels in it. */
export type PushDevices = {
  active: number;
  android: number;
  ios: number;
  linked: number;
  retired: number;
  last_seen_at: string | null;
  recent: { ref: string; platform: "android" | "ios"; app_version: string | null; last_seen_at: string; created_at: string; phone_hint: string | null }[];
};

/**
 * The sentence for each refusal the database raises (0152). The codes are stable; the words are staff copy.
 * A code nobody mapped is shown as it is, which names the fault to whoever reads it rather than hiding it.
 */
export function pushErrorMessage(code: string): string {
  switch (code) {
    case "forbidden":
      return "هذا الإجراء للإدارة برك.";
    case "push_title_required":
      return "اكتب عنوان للإشعار.";
    case "push_title_too_long":
      return "العنوان طويل: 60 حرف على الأكثر، لأنو يظهر في سطر وحد على شاشة التلفون.";
    case "push_body_required":
      return "اكتب نصّ الإشعار.";
    case "push_body_too_long":
      return "النصّ طويل: 240 حرف على الأكثر.";
    case "push_route_invalid":
      return "الوجهة هذي ما يعرفهاش التطبيق. اختار وحدة من القائمة.";
    case "push_audience_invalid":
      return "اختار لمن يتبعث الإشعار.";
    case "push_phone_required":
      return "اكتب رقم التلفون اللي باش يوصلو الإشعار.";
    case "push_phone_invalid":
      return "رقم التلفون موش صحيح. 8 أرقام، مثال: 98 123 456.";
    case "push_schedule_invalid":
      return "الوقت غالط. اختار وقت من توّا حتى 90 يوم الجاية.";
    case "push_no_devices":
      return "ما فمّاش جهاز يوصلو هذا الإشعار. يلزم تلفون فتح التطبيق وسمح بالإشعارات (من «حسابي ← فعّل الإشعارات»).";
    case "push_not_cancellable":
      return "الإشعار هذا خرج ولا تلغى من قبل، ما نجّمش نلغيوه.";
    default:
      return code ? `صار خطأ: ${code}` : "صار خطأ. عاود.";
  }
}

/**
 * The calls 0152 added, typed by hand — for the reason src/lib/push.ts gives for its own: `db:types` reads the
 * Management API and the project's token has expired, so the generated types do not carry these names yet.
 * The day it is renewed this type can go and the calls typecheck against the generated ones.
 */
export type PushStaffClient = {
  rpc: {
    (fn: "staff_create_push_campaign", args: { p: Record<string, unknown> }): PromiseLike<{ data: PushCampaignRow | null; error: { message: string; code?: string } | null }>;
    (fn: "staff_cancel_push_campaign", args: { p_id: string; p_reason?: string }): PromiseLike<{ data: PushCampaignRow | null; error: { message: string; code?: string } | null }>;
    (fn: "staff_push_devices", args?: Record<string, never>): PromiseLike<{ data: PushDevices | null; error: { message: string; code?: string } | null }>;
  };
  from(table: "push_campaigns"): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): PromiseLike<{ data: PushCampaignRow[] | null; error: { message: string } | null }>;
      };
    };
  };
};

export function asPushStaffClient(client: unknown): PushStaffClient {
  return client as PushStaffClient;
}
