"use client";

import { useLocale, useT } from "@/lib/i18n/client";

import { clockText, GROVE_ZONE, useMinute, useTimeZone, zoneCity } from "./time";

/**
 * «توّا في تونس 14:32 ··· توّا عندك 13:32». The first thing on the abroad page after its title: the hour at
 * home beside the visitor's own, live. It says, before any sentence does, that this page knows where they are
 * and that the times it offers are theirs.
 *
 * A visitor whose browser is already on Tunisian time sees the one clock: two identical ones would read as a
 * mistake.
 */
export function AbroadClocks() {
  const t = useT();
  const locale = useLocale();
  const minute = useMinute();
  const zone = useTimeZone();
  const at = minute === null ? null : minute * 60_000;
  const sameZone = zone === null || zone === GROVE_ZONE;

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className={`grid items-center gap-3 ${sameZone ? "grid-cols-1" : "grid-cols-[1fr_auto_1fr]"}`}>
        <Clock label={t("ui.abroad.clock_tunis")} time={at === null ? null : clockText(at, GROVE_ZONE, locale)} place="Tunis" tone="grove" />
        {sameZone ? null : (
          <>
            {/* The line between the two: dotted, with an olive leaf where it bends — the distance, drawn. */}
            <svg viewBox="0 0 64 24" aria-hidden="true" focusable="false" className="h-6 w-12 text-gold sm:w-16">
              <path d="M2 18 Q32 -4 62 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 4" strokeLinecap="round" />
              <path d="M32 3.5c3.2 0 5.6 2 6 4.6-3.2.4-5.7-.9-6-4.6Zm0 0c-3.2 0-5.6 2-6 4.6 3.2.4 5.7-.9 6-4.6Z" className="fill-leaf" />
            </svg>
            <Clock
              label={t("ui.abroad.clock_you")}
              time={at === null || zone === null ? null : clockText(at, zone, locale)}
              place={zone ? zoneCity(zone) : ""}
              tone="you"
            />
          </>
        )}
      </div>
      <p className="mt-3 border-t border-line pt-3 text-center text-caption text-muted">{t("ui.abroad.clock_note")}</p>
    </div>
  );
}

function Clock({ label, time, place, tone }: { label: string; time: string | null; place: string; tone: "grove" | "you" }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-caption font-semibold text-muted">{label}</p>
      <p
        dir="ltr"
        className={`mt-1 font-display text-[2.5rem] font-bold leading-none tabular-nums sm:text-5xl ${
          tone === "grove" ? "text-forest" : "text-gold"
        }`}
      >
        {/* The server does not know the time where the visitor is; a dash of the same width holds the place. */}
        {time ?? <span className="text-line-strong">--:--</span>}
      </p>
      {/* A city name is Latin in every language, so it reads left to right inside the line. */}
      <p dir="ltr" className="mt-1 truncate text-caption text-muted">
        {place || " "}
      </p>
    </div>
  );
}
