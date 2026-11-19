"use client";

import { useActionState, useMemo, useState } from "react";

import { formatCount, formatDate } from "@/lib/format";

import { bookFieldVisit } from "../actions";
import { slotHours, type FieldFile, type FieldVisit } from "../field-model";

/** The next open days a visit can take, from the database's own window and closed weekdays. */
function openDays(terms: FieldFile["terms"], count: number): string[] {
  const out: string[] = [];
  const day = new Date(`${terms.min_date}T00:00:00Z`);
  const last = new Date(`${terms.max_date}T00:00:00Z`);
  while (out.length < count && day <= last) {
    const iso = day.toISOString().slice(0, 10);
    const isoDow = ((day.getUTCDay() + 6) % 7) + 1;
    if (!terms.closed_weekdays.includes(isoDow)) out.push(iso);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

const WEEKDAY = new Intl.DateTimeFormat("ar-TN", { weekday: "long", timeZone: "UTC" });

/** «حدّد الموعد»: which offer, which day, what hour, how many, where. One press confirms it. */
export function BookCard({ file, visit }: { file: FieldFile; visit: FieldVisit | null }) {
  const [state, action, pending] = useActionState(bookFieldVisit, null);
  const defaultOffer = visit?.project_id ?? file.request?.project_id ?? file.offers[0]?.id ?? "";
  const [offerId, setOfferId] = useState(defaultOffer);
  const days = useMemo(() => openDays(file.terms, 8), [file.terms]);
  const hours = useMemo(() => slotHours(file.terms.slots), [file.terms.slots]);
  const [day, setDay] = useState(visit?.visit_date ?? "");
  const [hour, setHour] = useState(visit?.meeting_time ?? "");
  const [people, setPeople] = useState(String(visit?.people_count ?? 1));
  const offer = file.offers.find((item) => item.id === offerId);
  const [point, setPoint] = useState(visit?.meeting_point ?? offer?.meeting_point ?? file.terms.meeting_point ?? "");

  if (file.offers.length === 0) {
    return <p className="text-sm text-muted">ما فمّا حتى عرض منشور توّا. الموعد يتحدّد كي يكون فمّا عرض.</p>;
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="person_id" value={file.person.id} />
      <input type="hidden" name="request_id" value={file.request?.id ?? ""} />
      <input type="hidden" name="visit_date" value={day} />
      <input type="hidden" name="time" value={hour} />
      <input type="hidden" name="people_count" value={people} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">العرض</legend>
        <div className="flex flex-wrap gap-2">
          {file.offers.map((item) => (
            <label key={item.id} className="chip min-h-11 text-base">
              <input
                type="radio"
                name="project_id"
                value={item.id}
                checked={offerId === item.id}
                onChange={() => {
                  setOfferId(item.id);
                  if (!visit?.meeting_point) setPoint(item.meeting_point ?? file.terms.meeting_point ?? "");
                }}
                className="sr-only"
              />
              {item.name}
              <span className="text-xs font-normal text-muted">{formatCount(item.available)} فارغة</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">النهار</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {days.map((iso) => (
            <button
              key={iso}
              type="button"
              aria-pressed={day === iso}
              onClick={() => setDay(iso)}
              className="chip min-h-14 flex-col gap-0 text-base"
            >
              <span>{WEEKDAY.format(new Date(`${iso}T00:00:00Z`))}</span>
              <span className="text-xs font-normal text-muted">{formatDate(iso)}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          نهار آخر:
          <input
            type="date"
            min={file.terms.min_date}
            max={file.terms.max_date}
            value={days.includes(day) ? "" : day}
            onChange={(event) => setDay(event.target.value)}
            className="field field-sm w-auto"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">الساعة</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {hours.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={hour === value}
              onClick={() => setHour(value)}
              className="chip min-h-11 text-base tabular-nums"
              dir="ltr"
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">قدّاش من واحد جايين؟</legend>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.max(file.terms.max_people, 1) }, (_, index) => String(index + 1)).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={people === value}
              onClick={() => setPeople(value)}
              className="chip min-h-11 min-w-11 text-base tabular-nums"
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">نقطة اللقاء</span>
        <input
          name="meeting_point"
          value={point}
          onChange={(event) => setPoint(event.target.value)}
          maxLength={200}
          placeholder="مثلاً: قدّام الجامع الكبير في بوعرادة"
          className="field"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">ملاحظة (اختياري)</span>
        <input name="note" maxLength={300} defaultValue={visit?.staff_note ?? ""} className="field field-sm" />
      </label>

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending || !day || !hour || !offerId} className="btn btn-primary min-h-14 w-full text-lg">
        {pending ? "جارٍ التثبيت…" : visit ? "بدّل الموعد" : "ثبّت الموعد"}
      </button>
    </form>
  );
}
