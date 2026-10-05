/**
 * The eleven screens that play inside the phone.
 *
 * THEY ARE DRAWINGS, NOT SCREENSHOTS, and not the real components either. A screenshot ages the day a button
 * moves; the real components would drag the whole offers catalogue, the quote RPC and a form's worth of state
 * into a section whose job is to be looked at for two seconds. Every one of these is divs and inline SVG on
 * the site's own tokens, so they read as AgriZed without being able to break when AgriZed changes.
 *
 * NO IMAGES AT ALL — the land, the harvest and the oil are drawn. That keeps the whole section to a few KB on
 * a phone, and it keeps the owner free to replace any scene with a real photograph later without a layout
 * changing underneath him.
 *
 * Everything here is static markup: the motion belongs to the player (journey-demo.tsx), which fades one of
 * these out and the next one in. A scene that animated itself would still be animating in a tab nobody is
 * looking at.
 */

import type { ReactNode } from "react";

/* ── the small parts every scene is built from ─────────────────────────────────────────────────────────── */

/** A phone screen's own top bar: the app name and a step, the way the real screens carry one. */
function Bar({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
      <span className="truncate text-[0.6875rem] font-bold text-forest">{title}</span>
      {right ? <span className="flex-none text-[0.5625rem] text-muted tabular-nums">{right}</span> : null}
    </div>
  );
}

/** A filled field, drawn: a label and the value under it on the field's own surface. */
function Field({ label, value, done }: { label: string; value: string; done?: boolean }) {
  return (
    <div>
      <p className="text-[0.5625rem] font-semibold text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[0.625rem] font-medium text-ink">{value}</span>
        {done ? <Tick className="size-3 flex-none text-leaf" /> : null}
      </div>
    </div>
  );
}

function Button({ label, tone = "primary" }: { label: string; tone?: "primary" | "quiet" }) {
  return (
    <div
      className={`flex h-8 items-center justify-center rounded-xl text-[0.625rem] font-bold ${
        tone === "primary" ? "bg-forest text-paper" : "border border-line bg-surface text-forest"
      }`}
    >
      {label}
    </div>
  );
}

function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

/** A piece of ground with rows of olives on it — the picture the whole product is about. */
function Grove({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className={className}>
      <rect width="120" height="80" fill="var(--color-leaf-soft)" />
      <path d="M0 52h120v28H0z" fill="color-mix(in srgb, var(--color-leaf) 22%, var(--color-paper))" />
      <path d="M0 52 120 44v8z" fill="color-mix(in srgb, var(--color-leaf) 35%, var(--color-paper))" />
      <circle cx="96" cy="20" r="9" fill="var(--color-gold-bright)" opacity="0.55" />
      {[14, 38, 62, 86].map((x, row) => (
        <g key={x}>
          <path d={`M${x} 62v-7`} stroke="var(--color-forest-700)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx={x} cy={50} r={7 - row * 0.3} fill="var(--color-forest-600)" />
          <circle cx={x - 3} cy={47} r={4 - row * 0.2} fill="var(--color-leaf)" />
        </g>
      ))}
      {[26, 50, 74].map((x) => (
        <g key={x}>
          <path d={`M${x} 72v-6`} stroke="var(--color-forest-700)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx={x} cy={62} r="8" fill="var(--color-forest)" />
          <circle cx={x + 4} cy={59} r="4.5" fill="var(--color-leaf)" />
        </g>
      ))}
    </svg>
  );
}

/* ── the eleven ────────────────────────────────────────────────────────────────────────────────────────── */

function SceneInterest() {
  return (
    <>
      <Bar title="سجّل اهتمامك" right="1/6" />
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <Field label="الاسم واللقب" value="محمد الصالحي" done />
        <Field label="رقم الهاتف" value="98 ••• •••" done />
        <Field label="الولاية" value="صفاقس" done />
        <div className="mt-auto">
          <Button label="سجّل اهتمامك" />
          <p className="mt-2 text-center text-[0.5rem] leading-4 text-muted">التسجيل مجاني ولا يلزمك بالشراء.</p>
        </div>
      </div>
    </>
  );
}

function SceneOffers() {
  const rows = [
    { name: "عرض قصر الريح", place: "صفاقس", trees: "108 زيتونة" },
    { name: "عرض بوعرادة", place: "سليانة", trees: "1,000 زيتونة" },
    { name: "عرض الوادي الأخضر", place: "زغوان", trees: "130 زيتونة" },
  ];
  return (
    <>
      <Bar title="عروضنا" right="3" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        {rows.map((row, i) => (
          <div key={row.name} className={`overflow-hidden rounded-xl border ${i === 0 ? "border-forest/40 bg-leaf-soft/50" : "border-line bg-surface"}`}>
            <Grove className="h-10 w-full object-cover" />
            <div className="px-2 py-1.5">
              <p className="truncate text-[0.625rem] font-bold text-forest">{row.name}</p>
              <p className="text-[0.5rem] text-muted">
                {row.place} · {row.trees}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SceneTrees() {
  return (
    <>
      <Bar title="قدّاش زيتونة؟" right="3/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {["1", "5", "10", "25", "50", "100"].map((n) => (
            <div
              key={n}
              className={`flex h-8 items-center justify-center rounded-lg border text-[0.6875rem] font-bold tabular-nums ${
                n === "10" ? "border-forest bg-forest text-paper" : "border-line bg-surface text-ink"
              }`}
            >
              {n}
            </div>
          ))}
        </div>
        <div className="card-estimate mt-3 rounded-xl p-2.5">
          <p className="text-[0.5rem] font-semibold text-gold">تقدير</p>
          <p className="mt-1 font-display text-base font-bold text-forest tabular-nums">20,450 د.ت</p>
          <p className="text-[0.5rem] text-muted tabular-nums">10 زيتونات · 1,846 م²</p>
        </div>
        <div className="mt-auto">
          <Button label="التالي" />
        </div>
      </div>
    </>
  );
}

function SceneVisit() {
  const days = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
  return (
    <>
      <Bar title="احجز زيارتك" right="4/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="rounded-xl border border-line bg-surface p-2">
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d) => (
              <span key={d} className="text-[0.5rem] font-semibold text-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => (
              <span
                key={d}
                className={`flex h-4 items-center justify-center rounded text-[0.5rem] tabular-nums ${
                  d === 13 ? "bg-forest font-bold text-paper" : d < 6 ? "text-line-strong" : "text-ink"
                }`}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-leaf-soft px-2 py-1.5">
          <Tick className="size-3 flex-none text-forest" />
          <span className="text-[0.5625rem] font-semibold text-forest">السبت 13 · الصباح</span>
        </div>
        <div className="mt-auto">
          <Button label="أكّد الموعد" />
        </div>
      </div>
    </>
  );
}

function SceneLand() {
  return (
    <>
      <Bar title="زيارة الأرض" />
      <div className="relative flex-1">
        <Grove className="absolute inset-0 size-full" />
        <div className="absolute inset-x-2 bottom-2 rounded-xl bg-surface/95 px-2.5 py-2 backdrop-blur">
          <p className="text-[0.625rem] font-bold text-forest">قصر الريح — صفاقس</p>
          <p className="text-[0.5rem] text-muted tabular-nums">62,208 م² · زيتون قائم</p>
        </div>
        <div className="absolute end-2 top-2 flex items-center gap-1 rounded-full bg-forest px-2 py-1">
          <Pin className="size-2.5 text-gold-bright" />
          <span className="text-[0.5rem] font-bold text-paper">في الأرض</span>
        </div>
      </div>
    </>
  );
}

function SceneDeposit() {
  return (
    <>
      <Bar title="العربون" right="5/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="rounded-xl border border-line bg-surface p-2.5">
          {[
            ["العرض", "قصر الريح"],
            ["الزيتونات", "10"],
            ["العربون", "1,000 د.ت"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-dashed border-line py-1.5 last:border-0">
              <span className="text-[0.5625rem] text-muted">{k}</span>
              <span className="text-[0.5625rem] font-bold text-ink tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-xl bg-leaf-soft px-3 py-4">
          <span className="flex size-8 items-center justify-center rounded-full bg-forest">
            <Tick className="size-4 text-paper" />
          </span>
          <p className="text-[0.625rem] font-bold text-forest">تحجزو باسمك</p>
          <p className="text-center text-[0.5rem] leading-4 text-muted">10 زيتونات ما عادش متاحة لغيرك</p>
        </div>
      </div>
    </>
  );
}

function SceneContract() {
  return (
    <>
      <Bar title="العقد" right="6/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="flex-1 rounded-xl border border-line bg-surface p-2.5">
          <p className="text-[0.5625rem] font-bold text-forest">عقد بيع زيتونات</p>
          <div className="mt-2 space-y-1">
            {[90, 100, 70, 95, 60].map((w, i) => (
              <div key={i} className="h-1 rounded-full bg-line" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-2.5 rounded-lg bg-paper p-1.5">
            <p className="text-[0.5rem] text-muted">الأرقام</p>
            <p className="text-[0.5rem] font-bold text-forest tabular-nums" dir="ltr">
              QASR-0001 … 0010
            </p>
          </div>
          <div className="mt-2.5 flex items-end justify-between">
            <svg viewBox="0 0 60 20" aria-hidden className="h-5 w-16 text-forest">
              <path d="M2 15c6-10 9 2 13-4s6 6 11-2 9 5 14-3 10 4 18-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-[0.5rem] text-muted">إمضاء</span>
          </div>
        </div>
        <div className="mt-2.5">
          <Button label="نسخة العقد" tone="quiet" />
        </div>
      </div>
    </>
  );
}

function ScenePaying() {
  const rows = [
    ["القسط 1", "مخلّص"],
    ["القسط 2", "مخلّص"],
    ["القسط 3", "الشهر الجاي"],
  ];
  return (
    <>
      <Bar title="الخلاص" />
      <div className="flex flex-1 flex-col p-3">
        <div className="rounded-xl bg-forest p-2.5">
          <p className="text-[0.5rem] text-paper/70">تخلّص</p>
          <p className="font-display text-base font-bold text-paper tabular-nums">7,200 د.ت</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/25">
            <div className="h-full w-[38%] rounded-full bg-gold-bright" />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {rows.map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between rounded-lg border border-line bg-surface px-2 py-1.5">
              <span className="text-[0.5625rem] text-ink">{k}</span>
              <span className={`text-[0.5rem] font-bold ${i < 2 ? "text-success" : "text-muted"}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SceneFollow() {
  return (
    <>
      <Bar title="زيتونتي" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["10", "زيتونة"],
            ["1,846", "م²"],
          ].map(([f, l]) => (
            <div key={l} className="rounded-xl border border-line bg-surface px-2 py-1.5">
              <p className="font-display text-sm font-bold text-forest tabular-nums">{f}</p>
              <p className="text-[0.5rem] text-muted">{l}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Grove key={i} className="h-9 w-full rounded-lg object-cover" />
          ))}
        </div>
        <div className="space-y-1">
          {[
            ["التقليم", "صار"],
            ["الحرث", "صار"],
            ["الجني", "قريب"],
          ].map(([k, v], i) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className={`size-1.5 flex-none rounded-full ${i < 2 ? "bg-leaf" : "bg-line-strong"}`} />
              <span className="flex-1 text-[0.5625rem] text-ink">{k}</span>
              <span className="text-[0.5rem] text-muted">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SceneHarvest() {
  return (
    <>
      <Bar title="الجني والعصر" />
      <div className="flex flex-1 flex-col">
        <div className="relative h-24">
          <Grove className="absolute inset-0 size-full" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 pb-1.5">
            {[0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 20 16" aria-hidden className="h-4 w-5">
                <path d="M3 5h14l-2 9H5z" fill="var(--color-gold)" opacity="0.9" />
                <circle cx="8" cy="7" r="1.6" fill="var(--color-forest-600)" />
                <circle cx="12" cy="8" r="1.6" fill="var(--color-leaf)" />
              </svg>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2 p-3">
          <div className="flex items-center justify-center gap-2">
            <Drop className="size-5 text-forest" />
            <svg viewBox="0 0 24 8" aria-hidden className="h-2 w-8 text-line-strong ltr:-scale-x-100">
              <path d="M22 4H2m0 0 4-3M2 4l4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <Bottle className="size-6 text-gold" />
          </div>
          <p className="text-center text-[0.5625rem] font-semibold text-forest">الزيتون مشى للمعصرة</p>
        </div>
      </div>
    </>
  );
}

function SceneOil() {
  return (
    <>
      <Bar title="زيتك" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 bg-gold-soft/40 p-3">
        <div className="flex items-end gap-1.5">
          <Bottle className="size-10 text-gold" />
          <Bottle className="size-14 text-forest" />
          <Bottle className="size-10 text-gold" />
        </div>
        <p className="text-center font-display text-sm font-bold leading-tight text-forest">زيت من زيتونك</p>
        <div className="rounded-full bg-surface px-2.5 py-1">
          <p className="text-[0.5rem] font-semibold text-muted">محمد الصالحي · قصر الريح</p>
        </div>
      </div>
    </>
  );
}

/* ── glyphs ────────────────────────────────────────────────────────────────────────────────────────────── */

function Pin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}

function Drop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12.5-7-12.5Z" />
    </svg>
  );
}

function Bottle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 40" fill="none" aria-hidden className={className}>
      <path d="M10 2h4v7l3.2 4.2A5 5 0 0 1 18 16v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V16a5 5 0 0 1 .8-2.8L10 9V2Z" fill="currentColor" opacity="0.9" />
      <rect x="6.5" y="20" width="11" height="9" rx="1.2" fill="var(--color-paper)" opacity="0.85" />
      <rect x="9" y="0.5" width="6" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

/* ── the lookup the player reads ───────────────────────────────────────────────────────────────────────── */

export const SCENE_VIEWS: Record<string, ReactNode> = {
  interest: <SceneInterest />,
  offers: <SceneOffers />,
  trees: <SceneTrees />,
  visit: <SceneVisit />,
  land: <SceneLand />,
  deposit: <SceneDeposit />,
  contract: <SceneContract />,
  paying: <ScenePaying />,
  follow: <SceneFollow />,
  harvest: <SceneHarvest />,
  oil: <SceneOil />,
};
