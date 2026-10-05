/**
 * The eleven screens that play inside the phone.
 *
 * THEY ARE DRAWINGS, NOT SCREENSHOTS, and not the real components either. A screenshot ages the day a button
 * moves; the real components would drag the whole offers catalogue, the quote RPC and a form's worth of state
 * into a section whose job is to be looked at for two seconds. Every one of these is divs and inline SVG on
 * the site's own tokens, so they read as AgriZed without being able to break when AgriZed changes.
 *
 * THEY CARRY ALMOST NO WORDS, AND THAT IS THE POINT. The first version wrote real Arabic into every field and
 * button — and then rendered «سجّل اهتمامك» inside the phone on a French page, because a drawing cannot be
 * translated by `settings` the way a sentence can. So the labels are bars now: a form reads as a form, a
 * contract as a contract, a schedule as a schedule, in any of the five languages. The only text left is the
 * screen's own title, which arrives already translated from the owner's list, and FIGURES — prices, areas,
 * counts, dates — which are the one thing a reader wants to actually read and which the site formats per
 * language anyway. Everything a visitor needs in words is in the caption under the phone, in their language.
 *
 * NO IMAGES AT ALL — the land, the harvest and the oil are drawn, which keeps the whole section to a few KB.
 *
 * Everything here is static markup: the motion belongs to the player (journey-demo.tsx), which fades one of
 * these out and the next one in. A scene that animated itself would still be animating in a hidden tab.
 */

import type { ReactNode } from "react";

/* ── the small parts every scene is built from ─────────────────────────────────────────────────────────── */

/** A line of «text» that is not text: the shape of a label, in any language. */
function Line({ w = "70%", strong = false }: { w?: string; strong?: boolean }) {
  return <span className={`block h-1.5 rounded-full ${strong ? "bg-forest/35" : "bg-line-strong/70"}`} style={{ width: w }} />;
}

/** A phone screen's own top bar: the step's name, already in the reader's language, and a counter. */
function Bar({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
      <span className="truncate text-[0.6875rem] font-bold text-forest">{title}</span>
      {right ? <span className="flex-none text-[0.5625rem] text-muted tabular-nums">{right}</span> : null}
    </div>
  );
}

/** A filled field: the shape of a label, and a value box with a tick in it. */
function Field({ w = "45%", value = "62%" }: { w?: string; value?: string }) {
  return (
    <div className="space-y-1">
      <Line w={w} />
      <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-2">
        <span className="flex-1">
          <Line w={value} strong />
        </span>
        <Tick className="size-3 flex-none text-leaf" />
      </div>
    </div>
  );
}

function Button({ tone = "primary" }: { tone?: "primary" | "quiet" }) {
  return (
    <div className={`flex h-8 items-center justify-center rounded-xl ${tone === "primary" ? "bg-forest" : "border border-line bg-surface"}`}>
      <span className={`block h-1.5 w-12 rounded-full ${tone === "primary" ? "bg-paper/70" : "bg-forest/40"}`} />
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
    <svg viewBox="0 0 120 80" aria-hidden className={className} preserveAspectRatio="xMidYMid slice">
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

type SceneProps = { title: string };

function SceneInterest({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="1/6" />
      <div className="flex flex-1 flex-col gap-3 p-3">
        <Field w="42%" value="66%" />
        <Field w="34%" value="48%" />
        <Field w="28%" value="38%" />
        <div className="mt-auto space-y-2">
          <Button />
          <span className="mx-auto block h-1 w-24 rounded-full bg-line-strong/60" />
        </div>
      </div>
    </>
  );
}

function SceneOffers({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="3" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`overflow-hidden rounded-xl border ${i === 0 ? "border-forest/40 bg-leaf-soft/50" : "border-line bg-surface"}`}>
            <Grove className="h-10 w-full" />
            <div className="space-y-1.5 px-2 py-2">
              <Line w={i === 0 ? "62%" : "54%"} strong />
              <Line w="38%" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SceneTrees({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="3/6" />
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
        {/* The one estimate inside the phone wears the same dashed gold the real one does. */}
        <div className="card-estimate mt-3 space-y-1.5 rounded-xl p-2.5">
          <Line w="30%" />
          <p className="font-display text-base font-bold text-forest tabular-nums">20 450</p>
          <Line w="55%" />
        </div>
        <div className="mt-auto">
          <Button />
        </div>
      </div>
    </>
  );
}

function SceneVisit({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="4/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="rounded-xl border border-line bg-surface p-2">
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={`h${i}`} className="mx-auto block h-1 w-2.5 rounded-full bg-line-strong/70" />
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
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-leaf-soft px-2 py-2">
          <Tick className="size-3 flex-none text-forest" />
          <span className="block h-1.5 w-20 rounded-full bg-forest/35" />
        </div>
        <div className="mt-auto">
          <Button />
        </div>
      </div>
    </>
  );
}

function SceneLand({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} />
      <div className="relative flex-1">
        <Grove className="absolute inset-0 size-full" />
        <div className="absolute inset-x-2 bottom-2 space-y-1.5 rounded-xl bg-surface/95 px-2.5 py-2 backdrop-blur">
          <Line w="58%" strong />
          <p className="text-[0.5625rem] text-muted tabular-nums">62 208 m²</p>
        </div>
        <span className="absolute end-2 top-2 flex items-center gap-1 rounded-full bg-forest px-2 py-1">
          <Pin className="size-2.5 text-gold-bright" />
          <span className="block h-1 w-6 rounded-full bg-paper/70" />
        </span>
      </div>
    </>
  );
}

function SceneDeposit({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="5/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="rounded-xl border border-line bg-surface p-2.5">
          {["62 208 m²", "10", "1 000"].map((v, i) => (
            <div key={v} className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 last:border-0">
              <Line w={["40%", "32%", "36%"][i]} />
              <span className="flex-none text-[0.5625rem] font-bold text-ink tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-leaf-soft px-3 py-5">
          <span className="flex size-8 items-center justify-center rounded-full bg-forest">
            <Tick className="size-4 text-paper" />
          </span>
          <span className="block h-1.5 w-20 rounded-full bg-forest/35" />
          <span className="block h-1 w-28 rounded-full bg-forest/20" />
        </div>
      </div>
    </>
  );
}

function SceneContract({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} right="6/6" />
      <div className="flex flex-1 flex-col p-3">
        <div className="flex-1 rounded-xl border border-line bg-surface p-2.5">
          <Line w="55%" strong />
          <div className="mt-2.5 space-y-1.5">
            {["90%", "100%", "70%", "95%", "60%"].map((w, i) => (
              <Line key={i} w={w} />
            ))}
          </div>
          {/* The numbers are the point of the contract, and a tree number reads the same in every language. */}
          <div className="mt-2.5 space-y-1 rounded-lg bg-paper p-1.5">
            <Line w="25%" />
            <p className="text-[0.5rem] font-bold text-forest tabular-nums" dir="ltr">
              0001 … 0010
            </p>
          </div>
          <div className="mt-2.5 flex items-end justify-between">
            <svg viewBox="0 0 60 20" aria-hidden className="h-5 w-16 text-forest">
              <path d="M2 15c6-10 9 2 13-4s6 6 11-2 9 5 14-3 10 4 18-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="block h-1 w-8 rounded-full bg-line-strong/70" />
          </div>
        </div>
        <div className="mt-2.5">
          <Button tone="quiet" />
        </div>
      </div>
    </>
  );
}

function ScenePaying({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} />
      <div className="flex flex-1 flex-col p-3">
        <div className="space-y-1.5 rounded-xl bg-forest p-2.5">
          <span className="block h-1 w-10 rounded-full bg-paper/40" />
          <p className="font-display text-base font-bold text-paper tabular-nums">7 200</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper/25">
            <div className="h-full w-[38%] rounded-full bg-gold-bright" />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-2 py-2">
              <Line w="40%" />
              {i < 2 ? <Tick className="size-3 flex-none text-success" /> : <span className="size-2 flex-none rounded-full bg-line-strong" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SceneFollow({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {["10", "1 846"].map((f) => (
            <div key={f} className="space-y-1 rounded-xl border border-line bg-surface px-2 py-2">
              <p className="font-display text-sm font-bold text-forest tabular-nums">{f}</p>
              <Line w="55%" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Grove key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`size-1.5 flex-none rounded-full ${i < 2 ? "bg-leaf" : "bg-line-strong"}`} />
              <Line w={["52%", "44%", "36%"][i]} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SceneHarvest({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} />
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-3">
          <div className="flex items-center gap-2">
            <Drop className="size-5 text-forest" />
            <svg viewBox="0 0 24 8" aria-hidden className="h-2 w-8 text-line-strong ltr:-scale-x-100">
              <path d="M22 4H2m0 0 4-3M2 4l4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <Bottle className="size-6 text-gold" />
          </div>
          <span className="block h-1.5 w-24 rounded-full bg-forest/30" />
        </div>
      </div>
    </>
  );
}

function SceneOil({ title }: SceneProps) {
  return (
    <>
      <Bar title={title} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gold-soft/40 p-3">
        <div className="flex items-end gap-1.5">
          <Bottle className="size-10 text-gold" />
          <Bottle className="size-14 text-forest" />
          <Bottle className="size-10 text-gold" />
        </div>
        <span className="block h-2 w-28 rounded-full bg-forest/30" />
        <span className="block h-1.5 w-20 rounded-full bg-forest/15" />
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

/* ── the lookup the player reads, by the `key` of the owner's list ─────────────────────────────────────── */

export const SCENE_VIEWS: Record<string, (props: SceneProps) => ReactNode> = {
  interest: SceneInterest,
  offers: SceneOffers,
  trees: SceneTrees,
  visit: SceneVisit,
  land: SceneLand,
  deposit: SceneDeposit,
  contract: SceneContract,
  paying: ScenePaying,
  follow: SceneFollow,
  harvest: SceneHarvest,
  oil: SceneOil,
};
