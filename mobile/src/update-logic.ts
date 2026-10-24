/**
 * Whether an update notice is due, and where its button goes. No React, no native module: two functions of numbers
 * and strings, so they can be read, and run, on their own.
 *
 * THE OWNER SETS THREE ROWS PER PLATFORM (migration 0153): the newest build in the store, the oldest build still
 * allowed, and the store's address. A build number, not «1.1.0» — two builds of the same version differ, and the
 * number is the one Google Play shows. 0 means «not set», and a notice needs a real number to compare against.
 */

export type UpdateKind = "none" | "optional" | "required";

export type UpdateDecision = {
  kind: UpdateKind;
  /** The newest build the notice speaks of, so «later» can be remembered for exactly that build. */
  latest: number;
};

const NONE: UpdateDecision = { kind: "none", latest: 0 };

/**
 * `required` when the installed build is under the floor, `optional` when it is merely under the newest, `none`
 * otherwise — and `none` whenever there is nothing to open (no address) or nothing to compare (the phone's own
 * build number could not be read, which is the case in Expo Go and on the web).
 *
 * A floor above the newest build is capped at the newest: the Back Office refuses to save that order, but a row
 * edited by hand must not close the app to a build that is already the latest, which nobody could ever update.
 */
export function decideUpdate(input: { installed: number; latest: number; min: number; storeUrl: string }): UpdateDecision {
  const { installed, latest, min, storeUrl } = input;
  if (!storeUrl.trim() || !Number.isFinite(installed) || installed <= 0) return NONE;

  const floor = latest > 0 ? Math.min(min, latest) : min;
  if (floor > 0 && installed < floor) return { kind: "required", latest: Math.max(latest, floor) };
  if (latest > 0 && installed < latest) return { kind: "optional", latest };
  return NONE;
}

/**
 * The addresses to try, in order. A Play Store page opens in Play's own app through `market://details?id=…`, which
 * lands on the app's page and its Update button rather than in a browser tab; the https address is the fallback
 * for a phone without Play and for every other store.
 */
export function storeTargets(storeUrl: string): string[] {
  const url = storeUrl.trim();
  if (!url) return [];
  const isPlay = /^https:\/\/play\.google\.com\//.test(url);
  const id = /[?&]id=([A-Za-z0-9._]+)/.exec(url)?.[1];
  return isPlay && id ? [`market://details?id=${id}`, url] : [url];
}
