import * as Location from "expo-location";

/**
 * «قدّاش يبعد عليّ؟» — the distance between the person and one offer.
 *
 * WHY THIS IS THE ONLY PLACE THE APP ASKS FOR LOCATION. An offer's coordinates are published only when the
 * team ticks «إظهار الموقع»; `public_project_page` withholds them otherwise, and this is the one screen that
 * has them. So there is exactly one question worth the permission — how far away is this — and it is asked
 * on the screen that can answer it, by someone who tapped to ask.
 *
 * NEVER ON LAUNCH, NEVER IN THE BACKGROUND. `app.json` declares when-in-use only, with background location
 * switched off on both platforms. An app that asks where somebody is before they have asked it anything is
 * the kind of thing that turns a store review into a conversation, and it earns a refusal that on iOS cannot
 * be taken back.
 *
 * THE POSITION IS NOT KEPT. It lives in this module for the life of the process so that opening three offers
 * does not spin the GPS three times, and it is written nowhere — not to the Keychain, not to the database,
 * not into a request. The distance is worked out on the phone and shown on the phone.
 */

/** Where the person was, the last time they asked. Cleared when the process ends, and never persisted. */
let lastFix: { latitude: number; longitude: number; at: number } | null = null;

/** A fix older than this is taken again: someone who drove for ten minutes deserves a true answer. */
const FIX_TTL_MS = 10 * 60 * 1000;

export type NearbyResult =
  | { ok: true; km: number }
  /** Refused, now or before. On iOS this is final until the person visits Settings. */
  | { ok: false; reason: "denied" }
  /** Location services off, no fix available, or a timeout. Worth another tap. */
  | { ok: false; reason: "failed" };

/**
 * Great-circle distance in kilometres.
 *
 * The haversine formula on a sphere of 6371 km. It ignores the Earth's flattening, which is worth about
 * 0.3% — on «يبعد عليك 42 كم» that is a hundred metres, and the number is rounded far past it anyway.
 */
export function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * How far the person is from a published pair of coordinates.
 *
 * `Accuracy.Balanced` is roughly a hundred metres and is reached from the network without waking the GPS —
 * the right trade for a number shown in kilometres. Asking for `High` here would cost seconds and battery to
 * refine a figure that is then rounded away.
 */
export async function distanceToKm(target: { latitude: number; longitude: number }): Promise<NearbyResult> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.granted;

    // Once answered on iOS, `canAskAgain` is false and requesting again resolves instantly as denied.
    if (!granted && existing.canAskAgain) {
      const asked = await Location.requestForegroundPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { ok: false, reason: "denied" };

    const fresh = lastFix && Date.now() - lastFix.at < FIX_TTL_MS ? lastFix : null;
    const here =
      fresh ??
      (await (async () => {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          at: Date.now(),
        };
        lastFix = fix;
        return fix;
      })());

    return { ok: true, km: haversineKm(here, target) };
  } catch {
    // Location services switched off at the system level throws rather than refusing, and so does a fix that
    // never arrives. Neither is the person's problem, and neither is worth a stack trace.
    return { ok: false, reason: "failed" };
  }
}

/**
 * The number as it is read out loud.
 *
 * Under ten kilometres one decimal is meaningful — «2.4 كم» is a different walk from «2 كم». Above it, a
 * decimal is false precision on a fix that is good to a hundred metres, so it is a whole number. The digits
 * are Western throughout, which is what every other figure in this app uses.
 */
export function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}
