import { coverSlots, mediaFor, settingInt, settingJson, type PublicConfig } from "@/lib/config";

/**
 * The times a live video visit can be booked at (0130), worked out for the page from the owner's settings.
 *
 * THE HOURS ARE TUNISIAN WALL TIME, because they are the hours there is daylight in the grove; the visitor
 * reads each one in their own time zone, which only their browser knows. So the server lays the slots out
 * (`key` is the Tunisian wall time the database re-checks, `at` the instant) and the form prints `at` in the
 * visitor's zone. public.submit_video_visit applies the same four rules again on submit — hours, weekdays,
 * the window and the full ones — so a stale page can offer a time, never book one.
 */

const GROVE_ZONE = "Africa/Tunis";

export type VideoSlot = {
  /** Tunisian wall time, «2026-10-12T14:00»: what the form posts and the database parses. */
  key: string;
  /** The instant, ISO: what the visitor's browser prints in their own zone. */
  at: string;
  taken: boolean;
};

export type VideoDay = { date: string; slots: VideoSlot[] };

/**
 * The picture of the abroad page: its own slot `abroad.hero` once the owner uploads one, and until then the
 * home page's first cover picture — a real grove rather than the drawn one.
 */
export function abroadPhotoSlot(config: PublicConfig): string {
  if (mediaFor(config, "abroad.hero")) return "abroad.hero";
  return coverSlots(config)[0] ?? "abroad.hero";
}

export function videoMinutes(config: PublicConfig): number {
  return settingInt(config, "abroad.video_minutes", 20);
}

export function videoDays(config: PublicConfig, taken: readonly string[], now = new Date()): VideoDay[] {
  const hours = settingJson<unknown>(config, "abroad.video_hours", []);
  const weekdays = settingJson<unknown>(config, "abroad.video_weekdays", [1, 2, 3, 4, 5, 6]);
  const daysAhead = settingInt(config, "abroad.video_days_ahead", 21);
  const minHours = settingInt(config, "abroad.video_min_hours_ahead", 20);
  const hourList = Array.isArray(hours) ? hours.filter((h): h is string => typeof h === "string" && /^\d{2}:\d{2}$/.test(h)) : [];
  const dayList = new Set(Array.isArray(weekdays) ? weekdays.filter((d): d is number => typeof d === "number") : []);
  const full = new Set(taken.map((at) => new Date(at).getTime()));
  const earliest = now.getTime() + minHours * 3_600_000;

  const today = groveDate(now);
  const days: VideoDay[] = [];
  for (let offset = 1; offset <= daysAhead; offset++) {
    const date = addDays(today, offset);
    if (!dayList.has(isoWeekday(date))) continue;
    const slots = hourList
      .map((hour) => {
        const at = groveInstant(date, hour);
        return { key: `${date}T${hour}`, at: at.toISOString(), taken: full.has(at.getTime()), time: at.getTime() };
      })
      .filter((slot) => slot.time >= earliest)
      .map(({ key, at, taken: isTaken }) => ({ key, at, taken: isTaken }));
    if (slots.length > 0) days.push({ date, slots });
  }
  return days;
}

/** «2026-10-05», the calendar date in Tunisia at this instant. */
function groveDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: GROVE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday, the numbering `abroad.video_weekdays` uses (Postgres isodow). */
function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The instant a Tunisian wall time names. Read as UTC, then moved by the zone's offset at that instant — asked
 * of Intl rather than written down, so the day Tunisia changes its clocks again nothing here is wrong.
 */
function groveInstant(date: string, hour: string): Date {
  const guess = new Date(`${date}T${hour}:00Z`);
  const first = new Date(guess.getTime() - zoneOffset(guess) * 60_000);
  const second = zoneOffset(first);
  return second === zoneOffset(guess) ? first : new Date(guess.getTime() - second * 60_000);
}

/** Minutes the grove's clock is ahead of UTC at this instant. */
function zoneOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GROVE_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}
