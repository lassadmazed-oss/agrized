"use client";

import { useActionState, useMemo, useState } from "react";

import { WhatsAppMark } from "@/components/site/call-chooser";
import { ErrorAlert } from "@/components/site/error-alert";
import { readVisitSource } from "@/components/site/source-capture";
import { clockText, dateKey, dayText, GROVE_ZONE, useTimeZone } from "@/components/site/abroad/time";
import { useLocale, useT } from "@/lib/i18n/client";
import { INTL_NAMES } from "@/lib/i18n/locales";
import type { VideoDay } from "@/lib/abroad";

import { requestVideoVisit } from "./actions";
import { VIDEO_VISIT_IDLE, type VideoVisitState } from "./video-visit-state";

/**
 * «اختار موعدك» — the live video visit, booked in the visitor's own time.
 *
 * THE TIMES ARE PRINTED WHERE THE VISITOR IS. Each slot is a Tunisian hour (when there is light in the grove)
 * and an instant; the big figure is that instant on the visitor's clock, the small line under it the hour at
 * home, and a slot that lands on another calendar day where they live says so. The page cannot know the zone
 * on the server, so until the browser answers the figures hold their place with a dash, never a wrong hour.
 *
 * ONE FORM, NO STEPS. Four answers — who, which number, which grove, when — and an optional note; a wizard for
 * that would be ceremony.
 */
export function VideoVisitForm({
  days,
  offers,
  defaultOffer,
  whatsappHref,
}: {
  days: VideoDay[];
  offers: { code: string; name: string }[];
  defaultOffer: string | null;
  /** The team's own WhatsApp, for the case where no time is free. */
  whatsappHref: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const zone = useTimeZone();
  const [state, action, pending] = useActionState<VideoVisitState, FormData>(requestVideoVisit, VIDEO_VISIT_IDLE);
  const firstFree = days.find((day) => day.slots.some((slot) => !slot.taken))?.date ?? days[0]?.date ?? null;
  const [day, setDay] = useState<string | null>(firstFree);
  const [slot, setSlot] = useState<string | null>(null);
  // «Pick a time» is the one answer the browser cannot check for us (the chips are buttons), so it is checked here.
  const [missing, setMissing] = useState(false);

  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(INTL_NAMES[locale], { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }),
    [locale],
  );

  if (state.status === "done") {
    const when = zone ? `${dayText(new Date(state.at), zone, locale)} · ${clockText(new Date(state.at), zone, locale)}` : "";
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-leaf-soft text-forest">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.2 4.2L19 7" />
          </svg>
        </span>
        <h3 className="font-display text-2xl font-bold text-forest">{t("ui.abroad.done_title")}</h3>
        <p className="max-w-md leading-7 text-ink/80">{t("ui.abroad.done_text", { when, no: state.requestNo })}</p>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;
  // What was typed before a refusal comes back as the fields' defaults (see VideoVisitValues).
  const typed = error?.values;
  const current = days.find((d) => d.date === day) ?? null;

  return (
    <form
      action={action}
      // The first-touch source (utm, referrer) rides along like on the other forms. Written straight into the
      // field: React builds the form data after this handler, and a state update would land one render late.
      onSubmit={(event) => {
        if (days.length > 0 && !slot) {
          event.preventDefault();
          setMissing(true);
          return;
        }
        const field = event.currentTarget.elements.namedItem("source");
        if (field instanceof HTMLInputElement) field.value = JSON.stringify(readVisitSource());
      }}
      className="space-y-5"
    >
      <input type="hidden" name="time_zone" value={zone ?? ""} />
      <input type="hidden" name="slot" value={slot ?? ""} />
      <input type="hidden" name="source" defaultValue="" />
      {/* Honeypot: hidden from people and from assistive technology, filled only by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <ErrorAlert error={error?.message ?? null} pending={pending} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="vv-name" className="label">
            {t("ui.abroad.name_label")}
          </label>
          <input
            id="vv-name"
            name="full_name"
            required
            minLength={3}
            maxLength={120}
            autoComplete="name"
            defaultValue={typed?.fullName}
            aria-invalid={error?.field === "name" || undefined}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="vv-whatsapp" className="label">
            {t("ui.abroad.whatsapp_label")}
          </label>
          <input
            id="vv-whatsapp"
            name="whatsapp"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="+33 6 12 34 56 78"
            defaultValue={typed?.whatsapp}
            aria-invalid={error?.field === "whatsapp" || undefined}
            aria-describedby="vv-whatsapp-hint"
            className="field text-left"
          />
          <p id="vv-whatsapp-hint" className="mt-2 text-caption text-muted">
            {t("ui.abroad.whatsapp_hint")}
          </p>
        </div>
      </div>

      {offers.length > 0 ? (
        <div>
          <label htmlFor="vv-offer" className="label">
            {t("ui.abroad.offer_label")}
          </label>
          <select id="vv-offer" name="offer" defaultValue={typed?.offer ?? defaultOffer ?? ""} className="field">
            <option value="">{t("ui.abroad.offer_any")}</option>
            {offers.map((offer) => (
              <option key={offer.code} value={offer.code}>
                {offer.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="offer" value="" />
      )}

      {days.length === 0 ? (
        <div className="rounded-2xl bg-gold-soft/60 p-4 text-sm leading-7 text-ink">
          <p>{t("ui.abroad.no_slots")}</p>
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold text-forest underline-offset-4 hover:underline">
              <WhatsAppMark className="size-4" />
              {t("ui.common.call_whatsapp")}
            </a>
          ) : null}
        </div>
      ) : (
        <>
          {/* min-w-0: a fieldset is min-content wide by default, which let the row of days stretch the card. */}
          <fieldset className="min-w-0">
            <legend className="label">{t("ui.abroad.day_label")}</legend>
            {/* A row that scrolls sideways on a phone: three weeks of days do not wrap into anything readable. */}
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              {days.map((d) => {
                const free = d.slots.some((s) => !s.taken);
                const chosen = d.date === day;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!free}
                    aria-pressed={chosen}
                    onClick={() => {
                      setDay(d.date);
                      setSlot(null);
                    }}
                    className={`min-h-14 shrink-0 snap-start rounded-2xl border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      chosen ? "border-forest bg-forest text-paper" : "border-line bg-surface text-ink hover:border-forest/50"
                    }`}
                  >
                    {dayLabel.format(new Date(`${d.date}T12:00:00Z`))}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {current ? (
            <fieldset className="min-w-0">
              <legend className="label">{t("ui.abroad.time_label")}</legend>
              {missing ? (
                <p role="alert" className="mb-2 text-sm font-medium text-danger">
                  {t("ui.abroad.error_pick_time")}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {current.slots.map((s) => {
                  const at = new Date(s.at);
                  const chosen = slot === s.key;
                  const otherDay = zone ? dateKey(at, zone) !== current.date : false;
                  const later = zone ? dateKey(at, zone) > current.date : false;
                  return (
                    // A button, not a radio: React resets a form after its action, and a radio would come back
                    // unchecked under a chip that still looks chosen. The choice lives in state and in the
                    // hidden `slot` field, which survive the reset.
                    <button
                      key={s.key}
                      type="button"
                      disabled={s.taken}
                      aria-pressed={chosen}
                      onClick={() => {
                        setSlot(s.key);
                        setMissing(false);
                      }}
                      className={`relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center transition-colors disabled:cursor-not-allowed ${
                        s.taken
                          ? "border-line bg-paper text-muted"
                          : chosen
                            ? "border-forest bg-leaf-soft text-forest ring-2 ring-forest/30"
                            : "border-line bg-surface text-ink hover:border-forest/50"
                      }`}
                    >
                      <span dir="ltr" className={`font-display text-2xl font-bold leading-none tabular-nums ${s.taken ? "line-through" : ""}`}>
                        {zone ? clockText(at, zone, locale) : "--:--"}
                      </span>
                      <span className="mt-1 text-[0.72rem] leading-tight text-muted">
                        {s.taken
                          ? t("ui.abroad.slot_taken")
                          : t("ui.abroad.time_tunis", { time: clockText(at, GROVE_ZONE, locale) })}
                      </span>
                      {otherDay && !s.taken ? (
                        <span className="mt-0.5 text-[0.68rem] font-semibold text-gold">
                          {later ? t("ui.abroad.next_day") : dayText(at, zone ?? GROVE_ZONE, locale)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </>
      )}

      <div>
        <label htmlFor="vv-note" className="label">
          {t("ui.abroad.note_label")}
        </label>
        <textarea
          id="vv-note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder={t("ui.abroad.note_placeholder")}
          defaultValue={typed?.note}
          className="field min-h-20 py-3"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
        <input
          type="checkbox"
          name="consent"
          required
          defaultChecked={typed?.consent}
          aria-invalid={error?.field === "consent" || undefined}
          className="mt-1 size-5 flex-none accent-forest"
        />
        <span>{t("legal.consent_text")}</span>
      </label>

      <button type="submit" disabled={pending || days.length === 0} className="btn btn-primary min-h-13 w-full gap-2">
        <WhatsAppMark className="size-5" />
        {pending ? t("ui.abroad.pending") : t("ui.abroad.submit")}
      </button>
    </form>
  );
}
