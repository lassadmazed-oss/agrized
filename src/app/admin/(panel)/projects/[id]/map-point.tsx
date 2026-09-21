"use client";

import { useState } from "react";

import { FormField } from "@/components/ui";

/**
 * The offer's point on the map (owner, 2026-09-19: the two number boxes «should be better»).
 *
 * Nobody knows their land's latitude. They know how to open Google Maps, long-press the field, and copy what
 * comes up — which is either a link or a «34.552, 10.301» pair. So the screen takes THAT, and fills the two
 * numbers itself. The two numbers stay visible and editable, because they are what is stored and because a
 * reader must be able to see what was understood from what they pasted.
 *
 * No network call and no API key: everything is read out of the text.
 */
type MapPointProps = {
  latitude: number | string | null;
  longitude: number | string | null;
  canWrite: boolean;
};

/** Tunisia, generously bounded: a paste that lands outside it is a misread, not a farm. */
const TUNISIA = { latMin: 30, latMax: 38, lngMin: 7, lngMax: 12 };

/**
 * Every shape a copied Google Maps location arrives in:
 *   34.552, 10.301                    the «copy coordinates» long-press
 *   https://maps.app.goo.gl/…         a short link — no coordinates in it, so it is refused, not guessed
 *   …/@34.552,10.301,17z/…            the URL of an open map
 *   …?q=34.552,10.301  ·  !3d34.55!4d10.30   the other two forms Google writes
 */
function readPoint(text: string): { lat: number; lng: number } | null {
  const clean = text.trim();
  if (!clean) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // /@lat,lng,17z
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?q=lat,lng
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // the place marker Google appends
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/, // a bare pair
  ];

  for (const pattern of patterns) {
    const found = clean.match(pattern);
    if (!found) continue;
    const lat = Number(found[1]);
    const lng = Number(found[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export function MapPoint({ latitude, longitude, canWrite }: MapPointProps) {
  const [lat, setLat] = useState(latitude === null ? "" : String(latitude));
  const [lng, setLng] = useState(longitude === null ? "" : String(longitude));
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  function paste(text: string) {
    if (!text.trim()) {
      setNote(null);
      return;
    }
    const point = readPoint(text);
    if (!point) {
      // A shortened maps.app.goo.gl link carries no coordinates at all: it has to be opened first. Saying so is
      // the difference between a screen that looks broken and one that tells you the next move.
      setNote({
        tone: "warn",
        text: /goo\.gl|maps\.app/.test(text)
          ? "الرابط المختصر ما فيهش الإحداثيات. حلّو في Google Maps، وانسخ الرابط الطويل من فوق، ولّا اضغط مطوّل على البلاصة وانسخ الأرقام."
          : "ما لقيناش إحداثيات في اللي لصقت. ابعث رابط Google Maps، ولّا اكتب الأرقام هكّا: 34.552, 10.301",
      });
      return;
    }

    setLat(String(point.lat));
    setLng(String(point.lng));
    const inTunisia =
      point.lat >= TUNISIA.latMin && point.lat <= TUNISIA.latMax && point.lng >= TUNISIA.lngMin && point.lng <= TUNISIA.lngMax;
    setNote(
      inTunisia
        ? { tone: "ok", text: "تعمّرت. تثبّت في الخريطة تحت قبل ما تحفظ." }
        : {
            tone: "warn",
            text: "تعمّرت، أمّا النقطة هاذي برّا تونس. يمكن خط العرض وخط الطول متبدّلين — تثبّت في الخريطة تحت.",
          },
    );
  }

  const both = lat.trim() !== "" && lng.trim() !== "";

  return (
    <div className="sm:col-span-2">
      <FormField
        size="sm"
        label="موقع العرض على الخريطة"
        hint="حلّ Google Maps على الأرض، اضغط مطوّل عليها، وانسخ. الصق هنا والأرقام تتعمّر وحدها."
      >
        <input
          type="text"
          inputMode="url"
          disabled={!canWrite}
          placeholder="https://www.google.com/maps/@34.552,10.301,17z  ولّا  34.552, 10.301"
          onPaste={(event) => paste(event.clipboardData.getData("text"))}
          onChange={(event) => paste(event.target.value)}
          dir="ltr"
          className="field field-sm text-left"
        />
      </FormField>

      {note ? (
        <p
          role="status"
          className={`mt-1 text-caption leading-6 ${note.tone === "ok" ? "text-forest" : "text-danger"}`}
        >
          {note.text}
        </p>
      ) : null}

      <div className="mt-snug grid gap-snug sm:grid-cols-2">
        <FormField size="sm" label="خط العرض">
          <input
            name="latitude"
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            disabled={!canWrite}
            inputMode="decimal"
            placeholder="34.552"
            dir="ltr"
            className="field field-sm text-left"
          />
        </FormField>
        <FormField size="sm" label="خط الطول">
          <input
            name="longitude"
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            disabled={!canWrite}
            inputMode="decimal"
            placeholder="10.301"
            dir="ltr"
            className="field field-sm text-left"
          />
        </FormField>
      </div>

      {/* The check that costs nothing: the same link the offer page gives a visitor. Reading two decimals and
          believing them is how an offer ends up pointing at the sea. */}
      {both ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-snug inline-flex text-caption font-medium text-forest underline underline-offset-4"
        >
          شوف النقطة في الخريطة ↗
        </a>
      ) : null}
    </div>
  );
}
