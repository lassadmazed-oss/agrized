"use client";

import { useSyncExternalStore } from "react";

import { INTL_NAMES, type Locale } from "@/lib/i18n/locales";

/**
 * The two clocks of the abroad pages: the grove's, and the visitor's own. Neither is known on the server —
 * the page is rendered once for everyone, and only the browser knows its zone — so both are read through
 * useSyncExternalStore and are null in the server render; the caller draws a quiet placeholder until the
 * browser answers, never a wrong time.
 */

export const GROVE_ZONE = "Africa/Tunis";

const subscribeMinute = (callback: () => void) => {
  const id = window.setInterval(callback, 10_000);
  return () => window.clearInterval(id);
};
// Rounded to the minute so two reads inside the same minute are the same value, as the store requires.
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noValue = () => null;

/** The current minute (as minutes since the epoch), ticking; null on the server. */
export function useMinute(): number | null {
  return useSyncExternalStore(subscribeMinute, currentMinute, noValue);
}

const neverChanges = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/** The visitor's IANA time zone («Europe/Paris»); null on the server. */
export function useTimeZone(): string | null {
  return useSyncExternalStore(neverChanges, browserZone, noValue);
}

/** «14:32» on a 24-hour clock in `timeZone`, with the digits the site uses for the language. */
export function clockText(at: Date | number, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_NAMES[locale], { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** «lundi 12 octobre», the day `at` falls on in `timeZone`. */
export function dayText(at: Date | number, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_NAMES[locale], { timeZone, weekday: "long", day: "numeric", month: "long" }).format(at);
}

/** «2026-10-12», the calendar date of `at` in `timeZone`, for comparing two zones' days. */
export function dateKey(at: Date | number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** «Europe/Paris» → «Paris»: the city a time zone is named after, which is what a person recognises. */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}
