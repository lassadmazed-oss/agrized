import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { siteUrl } from "./api";

type NotificationsModule = typeof import("expo-notifications");

let loaded: NotificationsModule | null | undefined;

/**
 * expo-notifications, or null where its native half is not inside the app.
 *
 * WHY NOT A PLAIN IMPORT. Expo Go on Android has shipped without it since SDK 53, and its native module is
 * looked up while the package's own file is being evaluated: `import * as Notifications` there throws «Cannot
 * find native module 'ExpoTopicSubscriptionModule'» before a line of this app runs, and since the root layout
 * imports it too, the router then finds no layout at all and the app never opens. The person holding the
 * laptop cannot even look at a screen. Nothing about notifications is worth that, so the package is asked for
 * once, on first use, and its absence is an answer — `unsupported`, the same one a simulator gets — instead of
 * a crash. In a real build the module is always there and this is a plain require.
 */
export function notificationsModule(): NotificationsModule | null {
  if (loaded === undefined) {
    try {
      loaded = require("expo-notifications") as NotificationsModule;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

/**
 * The phone's half of push. The other half was already built: 0138 holds the devices, 0139 claims the rows,
 * src/lib/push.ts in the web repo sends them through Expo, and /api/mobile/push/register takes the token.
 * Nothing here decides what a notification says — it registers this installation and opens the right screen
 * when one is tapped.
 *
 * WHY THE TOKEN GOES TO THE WEBSITE AND NOT TO POSTGRES. `public.push_tokens` is granted to service_role
 * alone, because a push token is a device address: whoever holds one can make somebody's phone buzz. This
 * app ships the anon key, and anything shipped in a bundle is readable by whoever installs it. So the token
 * takes the road a demand takes — through the site, which holds the service key on its own server.
 *
 * PERMISSION IS NEVER ASKED ON LAUNCH, and that is a decision rather than an oversight. iOS gives an app ONE
 * chance: a person who refuses the system prompt cannot be asked again from inside the app, only sent to
 * Settings. Asked cold on first open, with nothing yet at stake, most people refuse — and that refusal is
 * permanent. So `enablePush()` is called from a screen where the person has just done something that has a
 * next step worth hearing about, and never before.
 *
 * FAILURE IS SILENT, DELIBERATELY. A device that does not register gets no notifications; it does not get a
 * sentence. The person asked for notifications, not for a report on our HTTP. Everything here returns a
 * reason for the caller to decide about, and throws nothing.
 *
 * EXPO GO CANNOT DO THIS. Remote push needs a development or production build (`eas build`); in Expo Go the
 * token request fails. That is expected while developing and is why `enablePush` reports `unsupported`
 * rather than treating it as a fault.
 */

/** Where the last successful registration is remembered, so a launch does not re-POST what the server has. */
const STORE_KEY = "agrized.push.registered";

export type PushOutcome =
  | { ok: true; token: string; linked: boolean }
  /** The person said no, or had already said no. On iOS this is final until they visit Settings. */
  | { ok: false; reason: "denied" }
  /** A simulator, Expo Go, or a web build: there is no device token to be had. */
  | { ok: false; reason: "unsupported" }
  /** Network, server, or a malformed token. Worth trying again later; nothing to tell the person. */
  | { ok: false; reason: "failed"; message: string };

/**
 * How a notification behaves while the app is open and on screen.
 *
 * Without a handler the system does nothing with a foreground notification: no banner, no sound, nothing —
 * the app receives it and the person sees no sign of it. The banner is shown, and the badge is not set,
 * because nothing in this app counts unread anything and a badge that never clears is a wrong number stuck
 * on the icon.
 */
export function configureNotifications(): void {
  notificationsModule()?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android 8 and later refuse to show a notification that belongs to no channel, and a channel's importance
 * cannot be raised after it is created — the person owns it from then on. So it is created once, up front,
 * at the importance these messages need: a reminder about an instalment or a confirmed visit should arrive
 * when it is sent.
 */
async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "AgriZed",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1f4a2c",
  });
}

/** EAS writes the project id into app.json; `getExpoPushTokenAsync` refuses without it in a bare build. */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * Asks for permission if it has not been granted, takes the token, and hands it to the website.
 *
 * `phone` links the device to a person. It is optional on purpose: someone can install the app, allow
 * notifications and never send a demand, and that device is still worth keeping — 0138 links it the moment
 * the number is known. Pass it whenever it is known, and call this again when it becomes known.
 */
export async function enablePush(phone?: string | null): Promise<PushOutcome> {
  // A simulator has no push token to give. Asking anyway shows a permission dialog that can never lead to a
  // notification, which is worse than not asking.
  if (!Device.isDevice) return { ok: false, reason: "unsupported" };

  // Expo Go on a real phone: no native module to ask, which is the same answer as no device token.
  const Notifications = notificationsModule();
  if (!Notifications) return { ok: false, reason: "unsupported" };

  try {
    await ensureAndroidChannel(Notifications);

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    // `canAskAgain` is false once iOS has been answered. Calling request again in that state resolves
    // immediately as denied and teaches the app nothing, so it is not called.
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { ok: false, reason: "denied" };

    const id = projectId();
    if (!id) return { ok: false, reason: "unsupported" };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return { ok: false, reason: "unsupported" };

    return await sendToken(token, phone ?? null);
  } catch (cause) {
    // Expo Go on a real phone lands here: the token request throws rather than returning. So do a lost
    // signal and a server that is down. None of them is the person's problem.
    return { ok: false, reason: "failed", message: cause instanceof Error ? cause.message : String(cause) };
  }
}

/**
 * POSTs the token, and remembers what was sent.
 *
 * The device is re-registered when the token changes (the system reissues them) or when the phone number
 * becomes known, and skipped when neither has — a launch should not cost a round trip to say what the server
 * already knows. The stored pair is the whole state; there is nothing else to keep in step.
 */
async function sendToken(token: string, phone: string | null): Promise<PushOutcome> {
  const stamp = `${token}|${phone ?? ""}`;
  const seen = await SecureStore.getItemAsync(STORE_KEY).catch(() => null);
  if (seen === stamp) return { ok: true, token, linked: Boolean(phone) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${siteUrl}/api/mobile/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        ...(phone ? { phone } : {}),
        ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok: true; linked: boolean }
      | { ok: false; reason?: string; message?: string }
      | null;

    if (!response.ok || !payload || !payload.ok) {
      return { ok: false, reason: "failed", message: payload && !payload.ok ? (payload.message ?? "") : `HTTP ${response.status}` };
    }

    // Only written after the server has it, so a failed POST is retried on the next call rather than
    // remembered as done.
    await SecureStore.setItemAsync(STORE_KEY, stamp).catch(() => {});
    return { ok: true, token, linked: payload.linked };
  } catch (cause) {
    return { ok: false, reason: "failed", message: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    clearTimeout(timer);
  }
}

/** Has this installation already registered? Lets a screen show the right state without asking the system. */
export async function pushAlreadyOn(): Promise<boolean> {
  const Notifications = notificationsModule();
  const [seen, permission] = await Promise.all([
    SecureStore.getItemAsync(STORE_KEY).catch(() => null),
    Notifications ? Notifications.getPermissionsAsync().catch(() => null) : Promise.resolve(null),
  ]);
  return Boolean(seen) && Boolean(permission?.granted);
}

/**
 * The places a notification written in the Back Office may send a tap to.
 *
 * AN ALLOW-LIST, NOT A PASSTHROUGH. `data.route` arrives inside a push, and a push is a string somebody typed
 * into a form; handing it straight to the router would let a typo — or a message nobody should have been able
 * to send — open a screen the app was never meant to open from outside. So only these destinations exist: the
 * four tabs, the tracking screen, and one offer by its code. Anything else is ignored, and the tap falls back to
 * the rule below.
 */
const ROUTES: ReadonlySet<string> = new Set(["/", "/offers", "/calculator", "/account", "/track"]);
const OFFER_ROUTE = /^\/offer\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Where a tapped notification goes.
 *
 * Two kinds arrive. A message the system queued about somebody's own file carries only ids — `{ outboxId,
 * template }`, never a name or an amount, because a notification sits on a lock screen where anyone can read it
 * — and the template key is enough to choose a destination. A message the owner wrote by hand in الإشعارات
 * carries `route`, the screen he chose, and that wins when it is one of the allowed places.
 *
 * Every one of them lands somewhere that exists: an unknown key opens the person's file rather than a screen
 * named after a guess.
 */
export function routeForNotification(data: unknown): string {
  const row = typeof data === "object" && data !== null ? (data as { route?: unknown; template?: unknown }) : {};
  if (typeof row.route === "string" && (ROUTES.has(row.route) || OFFER_ROUTE.test(row.route))) return row.route;

  const template = row.template;
  if (typeof template !== "string") return "/account";

  // The money and the file: contracts, instalments, receipts and visits all belong to زيتونتي.
  if (template.startsWith("contract.") || template.startsWith("installment.") || template.startsWith("payment.")) {
    return "/account";
  }
  if (template.startsWith("visit.")) return "/account";
  // A demand's own confirmation is about a request, which is what the tracking screen is for.
  if (template.startsWith("lead.") || template.startsWith("land_offer.")) return "/track";
  return "/account";
}
