import Link from "next/link";
import type { ReactNode } from "react";

import { EXAMPLE, HOW, TRUST } from "./copy";

/**
 * The three reading sections around the demo: how it works, what you actually get, and one person all the way
 * through (owner brief, sections 2, 4 and 5).
 *
 * ALL THREE ARE SERVER COMPONENTS. Nothing here has state, and nothing here needs the browser — a page that
 * ships three sections of client JavaScript to draw a list of seven words is the kind of weight the brief
 * explicitly asked us not to add.
 *
 * The arrows between steps are drawn with `ltr:-scale-x-100`, not with two different glyphs: the chain runs
 * right to left in Arabic and left to right in the other four, and it is the same drawing turned around.
 */

/* ── 2 · كيفاش تخدم AgriZed؟ ───────────────────────────────────────────────────────────────────────────── */

export function HowItWorks() {
  return (
    <section className="mt-6 md:mt-10">
      <h2 className="section-title text-center">{HOW.title}</h2>

      {/* A chain on a wide screen; on a phone it wraps into a column without the arrows fighting the wrap,
          which is why the arrow lives inside each step rather than between them. */}
      <ol className="mt-4 flex flex-wrap items-stretch justify-center gap-1.5 md:mt-6 md:gap-2">
        {HOW.steps.map((step, i) => (
          <li key={step.key} className="flex items-center gap-1.5 md:gap-2">
            <div className="flex min-w-24 flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-2.5 py-3 text-center md:min-w-32 md:px-4 md:py-4">
              <span className="flex size-8 items-center justify-center rounded-xl bg-leaf-soft text-forest md:size-10">
                <StepGlyph name={step.key} className="size-4 md:size-5" />
              </span>
              <span className="text-[0.6875rem] font-semibold leading-tight text-ink md:text-sm">{step.label}</span>
            </div>
            {i < HOW.steps.length - 1 ? (
              <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 flex-none text-line-strong ltr:-scale-x-100 md:size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5m0 0 5-5m-5 5 5 5" />
              </svg>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── 4 · شنوّة بالضبط باش يكون عندي؟ ────────────────────────────────────────────────────────────────────── */

export function TrustGrid() {
  return (
    <section className="mt-6 md:mt-10">
      <div className="text-center">
        <h2 className="section-title">{TRUST.title}</h2>
        <p className="mt-2 text-sm leading-7 text-muted sm:text-base">{TRUST.lead}</p>
      </div>

      {/* Ten short answers, not an accordion. The brief was explicit: nothing to open, nothing to hunt
          through — a visitor scanning this should have read all ten before deciding to read any. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 md:mt-6 md:gap-3 lg:grid-cols-3">
        {TRUST.items.map((item) => (
          <div key={item.key} className="flex gap-2.5 rounded-2xl border border-line bg-surface p-3 md:p-4">
            <span className="flex size-8 flex-none items-center justify-center rounded-xl bg-leaf-soft text-forest">
              <StepGlyph name={item.icon} className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-bold leading-tight text-forest md:text-sm">{item.q}</p>
              <p className="mt-1 text-[0.75rem] leading-6 text-muted md:text-[0.8125rem]">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 5 · مثال حريف ─────────────────────────────────────────────────────────────────────────────────────── */

export function ExampleStory({ interestHref }: { interestHref: string }) {
  return (
    <section className="mt-6 md:mt-10">
      <div className="rounded-3xl bg-forest p-4 text-paper md:p-8">
        <p className="pill bg-paper/15 text-gold-bright">
          <span aria-hidden className="size-1.5 rounded-full bg-gold-bright" />
          {EXAMPLE.eyebrow}
        </p>
        <h2 className="section-title mt-2.5 text-paper">{EXAMPLE.title}</h2>
        <p className="mt-1.5 text-[0.8125rem] leading-6 text-paper/75 md:text-sm">{EXAMPLE.lead}</p>

        {/* A rail of nine beads. It is one line of reading on a wide screen and one column on a phone — the
            same list either way, because the point is the ORDER and the order survives the wrap. */}
        <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLE.steps.map((step, i) => (
            <li key={step.key} className="flex items-start gap-2.5 rounded-2xl bg-paper/[0.07] p-3">
              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-gold-bright text-[0.625rem] font-bold text-forest-700 tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-bold leading-tight text-paper">{step.label}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-5 text-paper/70">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.6875rem] leading-5 text-paper/60">{EXAMPLE.note}</p>
          <Link href={interestHref} className="btn btn-primary flex-none bg-gold-bright text-forest-700 hover:opacity-90">
            {EXAMPLE.startCta}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── one glyph set, named by what the step is ──────────────────────────────────────────────────────────── */

const GLYPHS: Record<string, ReactNode> = {
  "pick-offer": <path d="M4 7h16M4 12h10M4 17h7" />,
  "pick-trees": <path d="M12 21v-6m0 0a5 5 0 1 0-4-8 4 4 0 1 0 1 7.5M12 15a5 5 0 0 0 4-8 4 4 0 0 1-1 7.5" />,
  visit: <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Zm0-9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />,
  confirm: <path d="m5 13 4.5 4.5L19 7" />,
  contract: <path d="M7 3h7l5 5v13H7zM14 3v5h5M9.5 13h6M9.5 17h4" />,
  follow: <path d="M4 5h16v11H4zM9 20h6M12 16v4" />,
  oil: <path d="M10 3h4v5l2.4 3.2A4 4 0 0 1 17 13v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6a4 4 0 0 1 .6-1.8L10 8V3Z" />,
  tree: <path d="M12 21v-6m0 0a5 5 0 1 0-4-8 4 4 0 1 0 1 7.5M12 15a5 5 0 0 0 4-8 4 4 0 0 1-1 7.5" />,
  pin: <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Zm0-9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />,
  tag: <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9zM8 8h.01" />,
  doc: <path d="M7 3h7l5 5v13H7zM14 3v5h5" />,
  pen: <path d="M3 21h18M5 17l9.5-9.5a2.1 2.1 0 1 1 3 3L8 20l-4 1z" />,
  wallet: <path d="M3 7h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 7a2 2 0 0 1 2-2h9M16 13h.01" />,
  screen: <path d="M4 5h16v11H4zM9 20h6M12 16v4" />,
  calendar: <path d="M4 7h16v13H4zM4 11h16M9 4v4M15 4v4" />,
  basket: <path d="M4 9h16l-2 11H6zM8 9l2-5M16 9l-2-5" />,
  bottle: <path d="M10 3h4v5l2.4 3.2A4 4 0 0 1 17 13v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6a4 4 0 0 1 .6-1.8L10 8V3Z" />,
};

function StepGlyph({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {GLYPHS[name] ?? GLYPHS.confirm}
    </svg>
  );
}
