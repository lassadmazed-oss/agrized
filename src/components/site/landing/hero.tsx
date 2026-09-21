import Link from "next/link";
import type { ReactNode } from "react";

import { estimateLabel } from "@/components/site/site-header";
import { SitePhoto } from "@/components/site/site-photo";
import { settingJson, settingText, type PublicConfig } from "@/lib/config";

/*
 * The hero of the home page, rebuilt from the owner's reference drawing (2026-09-21).
 *
 * THE ONE MOVE THAT DECIDES EVERYTHING: the photograph is no longer darkened. The page used to run a
 * forest gradient over the grove and set the headline in paper on top of it; the reference washes the
 * TEXT SIDE of the picture almost to paper and sets the words in forest and gold on that wash, leaving
 * the sky and the trees on the other side plainly visible. So the scrim is now directional and only as
 * wide as the words: strong where the column is, absent where the picture is.
 *
 * MIRRORING. The drawing is an LTR composition with Arabic pasted into it — logo at the far left, text
 * column at the left, the figures slab at the right, the primary button to the left of the secondary.
 * Rendered literally on an RTL page the headline would start from the wrong side of the screen and the
 * button pair would read backwards. What is built here mirrors the PAGE-LEVEL sides (text column and
 * logo at the inline-start, slab and decoration at the inline-end, primary button first) and keeps every
 * block's internal composition as drawn, because those are already RTL-correct: the eyebrow's hairline
 * trails, each icon leads its label, and every arrow points toward the inline-end, which is forward.
 *
 * NOTHING HERE WRITES COPY. Every sentence arrives through `heroCopy()` / `heroPromises()` below, which
 * read `settings` with the wording the owner already seeded as the fallback. The drawing tells us where
 * a sentence sits and how big it is; it never tells us what it says — its own Arabic is full of
 * generator typos («بينة» for «بيئة», «تكير» for «تكبر») and none of it may be copied off the image.
 */

/* -------------------------------------------------------------------------------------------------
 * Icons
 *
 * Inline SVG, no icon library (they would be a dependency and a download for five glyphs). They live in
 * this file because the landing module is not allowed a fifth file today; they belong in
 * `landing/icons.tsx` the moment someone is allowed to make one.
 * ---------------------------------------------------------------------------------------------- */

export type LandingIconName =
  | "leaf"
  | "chart"
  | "people"
  | "hand"
  | "tree"
  | "pin"
  | "globe"
  | "gear"
  | "document"
  | "calculator"
  | "map"
  | "arrow";

/** The icon codes the Back Office already writes in `start.values`, and anything unknown, land on a leaf. */
export function landingIconName(code: unknown): LandingIconName {
  const known: LandingIconName[] = [
    "leaf",
    "chart",
    "people",
    "hand",
    "tree",
    "pin",
    "globe",
    "gear",
    "document",
    "calculator",
    "map",
    "arrow",
  ];
  return typeof code === "string" && (known as string[]).includes(code) ? (code as LandingIconName) : "leaf";
}

type IconProps = { name: LandingIconName; className?: string };

/**
 * One decorative glyph. Always `aria-hidden`: every icon on this page sits beside the words that carry
 * its meaning, so a reader who cannot see it has lost nothing.
 *
 * The promise glyphs are drawn FILLED and the rest OUTLINED, which is how the reference tells the two
 * families apart — the promises card is the one solid, close-up object in the picture.
 */
export function LandingIcon({ name, className = "size-5" }: IconProps) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true as const, focusable: "false" as const };
  const outline = { ...common, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "chart":
      return (
        <svg {...common} fill="currentColor">
          <rect x="3.5" y="13" width="4" height="7.5" rx="1.2" />
          <rect x="10" y="8.5" width="4" height="12" rx="1.2" />
          <rect x="16.5" y="4" width="4" height="16.5" rx="1.2" />
        </svg>
      );
    case "people":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="8.8" cy="8.2" r="3.1" />
          <circle cx="16.8" cy="9.4" r="2.4" />
          <path d="M2.6 19.4a6.2 6.2 0 0 1 12.4 0v1.2H2.6v-1.2Z" />
          <path d="M15.6 14.4a5.6 5.6 0 0 1 5.8 5.3v.9h-4.2v-1.2c0-1.8-.6-3.5-1.6-5Z" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="12" cy="6.2" r="3.2" />
          <path d="M3.4 12.6c0-1.1.9-2 2-2h2.3l3.3 3.2v7.1H8.4a5 5 0 0 1-5-5v-3.3Z" />
          <path d="M20.6 12.6c0-1.1-.9-2-2-2h-2.3L13 13.8v7.1h2.6a5 5 0 0 0 5-5v-3.3Z" />
        </svg>
      );
    case "tree":
      // The project's own olive mark (tree-card.tsx), drawn at a single size for a figure column.
      return (
        <svg {...outline}>
          <path d="M12 21v-6.5" />
          <path d="M12 16.5 9 14.5M12 14.5l3-2.2" />
          <circle cx="12" cy="8" r="4.4" />
          <circle cx="7.2" cy="11" r="2.7" />
          <circle cx="16.8" cy="11" r="2.4" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common} fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 22c.35 0 7-6.4 7-11.2A7 7 0 1 0 5 10.8C5 15.6 11.65 22 12 22Zm0-8.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z"
          />
        </svg>
      );
    case "globe":
      return (
        <svg {...outline}>
          <circle cx="12" cy="12" r="8.6" />
          <path d="M3.4 12h17.2" />
          <path d="M12 3.4c2.2 2.3 3.4 5.3 3.4 8.6S14.2 18.3 12 20.6c-2.2-2.3-3.4-5.3-3.4-8.6S9.8 5.7 12 3.4Z" />
        </svg>
      );
    case "gear":
      return (
        <svg {...outline}>
          <circle cx="12" cy="12" r="3.1" />
          <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
        </svg>
      );
    case "document":
      return (
        <svg {...outline}>
          <path d="M13.5 2.9H7.4a1.6 1.6 0 0 0-1.6 1.6v15a1.6 1.6 0 0 0 1.6 1.6h9.2a1.6 1.6 0 0 0 1.6-1.6V7.6l-4.7-4.7Z" />
          <path d="M13.3 3v4.4h4.7" />
          <path d="M9 12.6h6M9 16h4.4" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...outline}>
          <rect x="4.6" y="2.9" width="14.8" height="18.2" rx="2.4" />
          <path d="M8 6.8h8v3.1H8z" />
          <path d="M8.4 13.6h.02M12 13.6h.02M15.6 13.6h.02M8.4 17.2h.02M12 17.2h.02M15.6 17.2h.02" strokeWidth={2.2} />
        </svg>
      );
    case "map":
      // The land mark the two doors already use (home-paths.tsx): a folded map, not a pin.
      return (
        <svg {...outline}>
          <path d="M3.5 7.5 9.75 4.5l4.5 2.25L20.5 4v12.5l-6.25 2.75-4.5-2.25L3.5 20z" />
          <path d="M9.75 4.5v12.5M14.25 6.75v12.5" />
        </svg>
      );
    case "arrow":
      // Forward. The site is RTL at the root (`<html dir="rtl">`), so forward is the physical left and an
      // SVG path cannot follow `direction` on its own — it is drawn pointing there.
      return (
        <svg {...outline} strokeWidth={2.2}>
          <path d="M19.5 12H4.5" />
          <path d="M10.5 5.5 4 12l6.5 6.5" />
        </svg>
      );
    case "leaf":
    default:
      return (
        <svg {...common} fill="currentColor">
          <path d="M21 2.9c-8.6-.5-14.7 2-17.1 6.9-1.9 3.9-.5 8.4 3.1 10.2 3.7 1.9 8.3.2 10.7-3.9C20 12.5 21 8.2 21 2.9Z" opacity="0.92" />
          <path d="M3.6 21.4a.9.9 0 0 1-.5-1.6c2.8-2 5-4.7 6.7-8a.9.9 0 1 1 1.6.8c-1.8 3.6-4.2 6.5-7.3 8.7a.9.9 0 0 1-.5.1Z" />
        </svg>
      );
  }
}

/** The olive sprig the reference draws beside its calculator mock. A line drawing, not a photograph. */
export function OliveSprig({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true" focusable="false">
      <path
        d="M14 108C34 88 56 70 84 58c12-5 20-14 22-28"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g fill="currentColor">
        <ellipse cx="44" cy="76" rx="13" ry="7.5" transform="rotate(-36 44 76)" />
        <ellipse cx="66" cy="58" rx="13" ry="7.5" transform="rotate(-36 66 58)" />
        <ellipse cx="86" cy="42" rx="12" ry="7" transform="rotate(-36 86 42)" />
        <ellipse cx="58" cy="88" rx="11" ry="6.5" transform="rotate(26 58 88)" />
        <ellipse cx="80" cy="70" rx="11" ry="6.5" transform="rotate(26 80 70)" />
        <circle cx="52" cy="62" r="6.5" />
        <circle cx="74" cy="46" r="6" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Copy
 * ---------------------------------------------------------------------------------------------- */

export type HeroCopy = {
  eyebrow: string;
  /** The whole sentence, as the owner wrote it. */
  headline: string;
  /** The word of it set in gold. Empty means «the last word», which survives the owner rewriting it. */
  headlineAccent: string;
  /** The darker of the two sub-lines. */
  subLead: string;
  /** The lighter one: today the «registering is free» notice. */
  subNote: string;
  primaryLabel: string;
  secondaryLabel: string;
};

/** Every sentence of the hero, from settings, with the owner's seeded wording as the fallback. */
export function heroCopy(config: PublicConfig): HeroCopy {
  return {
    eyebrow: settingText(config, "site.hero_eyebrow"),
    headline: settingText(config, "site.home_headline"),
    // OPTIONAL key. Without it the rule below colours the last word, which is «مشروعك» today and stays
    // right if the owner rewrites the headline — so nothing has to be seeded for the drawing to be met.
    headlineAccent: settingText(config, "site.home_headline_accent"),
    subLead: settingText(config, "site.home_subheadline"),
    subNote: settingText(config, "site.free_interest_notice"),
    // The calculator says the same word here, in the header, on the card below and in the sticky bar
    // (site-header.tsx:15-21). The drawing's longer «احسب مشروعك الآن» would be a fourth variant.
    primaryLabel: estimateLabel(config),
    secondaryLabel: settingText(config, "site.cta_offers_label", "شوف العروض"),
  };
}

export type HeroPromise = { title: string; text: string; icon: LandingIconName };

type PromiseRow = { title?: unknown; text?: unknown; icon?: unknown };
type ValueRow = { ar?: unknown; icon?: unknown };

/**
 * The three rows of the floating card.
 *
 * `site.hero_promises` is the key that owns them (see the report). Until it exists the card falls back to
 * `start.values` — six slogans the owner already writes, each carrying an icon code of its own — MINUS
 * any slogan the hero is printing anyway. That subtraction is the whole point: the first three entries of
 * `start.values` are, verbatim, the headline, the sub-line and the eyebrow, so taking them would print
 * the same three sentences twice inside one screen.
 *
 * It also settles the warning the reference raises: its «مدخول إضافي — مع الوقت» is a statement about
 * income, and the site's own legal line says «AgriZed لا تضمن أي إنتاج أو مردود مالي». Nothing here can
 * say it unless the owner writes it, and whatever he writes he can delete.
 */
export function heroPromises(config: PublicConfig, limit = 3): HeroPromise[] {
  const own = settingJson<PromiseRow[]>(config, "site.hero_promises", []);
  if (Array.isArray(own) && own.length > 0) {
    return own
      .flatMap((row) => {
        const title = typeof row?.title === "string" ? row.title.trim() : "";
        return title
          ? [{ title, text: typeof row?.text === "string" ? row.text : "", icon: landingIconName(row?.icon) }]
          : [];
      })
      .slice(0, limit);
  }

  const said = [
    settingText(config, "site.hero_eyebrow"),
    settingText(config, "site.home_headline"),
    settingText(config, "site.home_subheadline"),
  ].filter(Boolean);
  const values = settingJson<ValueRow[]>(config, "start.values", []);
  if (!Array.isArray(values)) return [];

  return values
    .flatMap((row) => {
      const title = typeof row?.ar === "string" ? row.ar.trim() : "";
      if (!title) return [];
      // A slogan the hero already prints, in either direction: the sub-line opens with one of them word
      // for word, so «is one inside the other» is the test, not equality.
      if (said.some((line) => line.includes(title) || title.includes(line))) return [];
      return [{ title, text: "", icon: landingIconName(row?.icon) }];
    })
    .slice(0, limit);
}

/** Splits the headline so its last word — or the word the owner named — can be set in gold. */
function splitHeadline(headline: string, accent: string): { lead: string; accent: string } {
  const line = headline.trim();
  if (!line) return { lead: "", accent: "" };
  const named = accent.trim();
  if (named && line.endsWith(named)) return { lead: line.slice(0, line.length - named.length).trim(), accent: named };
  const at = line.lastIndexOf(" ");
  return at <= 0 ? { lead: "", accent: line } : { lead: line.slice(0, at), accent: line.slice(at + 1) };
}

/* -------------------------------------------------------------------------------------------------
 * The band
 * ---------------------------------------------------------------------------------------------- */

export type HeroProps = {
  config: PublicConfig;
  copy: HeroCopy;
  /** Empty hides the floating card entirely, exactly like every other block on this page. */
  promises: HeroPromise[];
  primaryHref: string;
  /** Empty hides the second button; the first one then widens. */
  secondaryHref?: string;
  /** `<HeroStats …>`, or nothing while the statistics module is closed. */
  stats?: ReactNode;
};

export function Hero({ config, copy, promises, primaryHref, secondaryHref = "", stats }: HeroProps) {
  const { lead, accent } = splitHeadline(copy.headline, copy.headlineAccent);

  return (
    <section className="relative isolate min-h-[34rem] overflow-hidden sm:min-h-[38rem] lg:min-h-[44rem]">
      <SitePhoto config={config} slot="home.hero" fill priority sizes="100vw" />

      {/* THE WASH, and the readability rule that governs it: it must hold paper at ~90 % or more across
          the whole width of the text column, so the contrast is AA whatever photograph the owner uploads
          next. It is measured against the column, never against the picture.
          Two layers rather than one gradient with breakpoint variants, because overriding `from-*`,
          `via-*` and `to-*` per breakpoint is a way to end up with half a gradient.
          At 375 there is no «beside», so the wash rotates: it rises from the foot and the whole text
          stack sits on it, and the top of the photograph stays a photograph. */}
      {/* Below lg the stops are LENGTHS, not percentages, and they are tuned against the padding below:
          the photograph is untouched for the first 5.5rem, has become solid paper by 12.5rem, and the
          text stack begins at 13rem. A percentage stop cannot do that — the band's height depends on how
          much the owner wrote, so the fade would drift up into the headline the longer the copy gets. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0,transparent_5.5rem,var(--color-paper)_12.5rem)] lg:hidden"
      />
      {/* From lg the wash runs along the inline axis instead. `to left` is the inline-end here because the
          whole site is RTL at the root (`<html dir="rtl">`), and a gradient has no logical form to write.
          The stops are pulled in again at xl: the text column is a much bigger share of a 1024px screen
          than of a 1600px one, and the rule is that the column must sit on ≥90 % paper at EVERY width —
          measured against the column, never against whichever photograph is in the slot this month. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-linear-to-l from-paper from-52% via-paper/70 via-72% to-transparent to-92% lg:block xl:from-46% xl:via-60% xl:to-82%"
      />

      {/* The top padding suits a header bar whether it floats over this band (the drawing) or still sits
          in the flow above it, which is what `sticky top-0` does today — the hero does not depend on that
          decision, which belongs to another file. The foot clears the 96px the two cards pull up by, and
          leaves ~48px of photograph between the figures slab and their top edge. */}
      <div className="relative mx-auto max-w-7xl px-4 pb-cozy pt-[13rem] sm:px-6 sm:pt-[15rem] lg:pb-36 lg:pt-[7.5rem]">
        {/* The text column runs to a 34rem measure so the headline breaks into two big lines; the end
            column holds the promises card at its top and the figures slab at its foot, which is the
            diagonal the drawing composes on. */}
        <div className="grid gap-roomy lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-stretch lg:gap-roomy">
          <div className="max-w-[34rem]">
            {copy.eyebrow ? (
              <p className="flex items-center gap-snug text-label font-semibold text-gold">
                {/* No letter-spacing: tracking breaks the joins in Arabic. The drawing's spaced «AGRIZED»
                    is Latin, and it is the brand name where our setting holds a sentence. */}
                {copy.eyebrow}
                <span aria-hidden="true" className="h-px w-8 bg-gold/40 sm:w-14" />
              </p>
            ) : null}

            {/* 44px at 375 → 72px from 1280 up. `_` is the space CSS requires around `+` inside clamp(). */}
            {accent ? (
              <h1 className="mt-snug font-display text-[clamp(2.75rem,1.45rem_+_4.4vw,4.5rem)] font-bold leading-[1.12] text-forest-700">
                {lead ? <span className="block">{lead}</span> : null}
                {/* The accent is presentation applied to the owner's own sentence: no second string to
                    keep in step, and the gold word keeps a line of its own, which is the composition. */}
                <span className="block text-gold">{accent}</span>
              </h1>
            ) : null}

            {copy.subLead ? (
              <p className="mt-cozy max-w-[32rem] text-[1.0625rem] leading-8 text-ink/80 sm:text-lg">{copy.subLead}</p>
            ) : null}
            {copy.subNote ? (
              <p className="mt-tight max-w-[32rem] text-caption leading-7 text-muted sm:text-base">{copy.subNote}</p>
            ) : null}

            {/* Primary first, so the RTL reader meets it first. At 375 the pair stacks full-width: two
                56px pills side by side do not fit 343px of usable screen. */}
            {copy.primaryLabel || (secondaryHref && copy.secondaryLabel) ? (
              <div className="mt-roomy flex flex-col gap-snug sm:flex-row sm:items-center">
                {copy.primaryLabel ? (
                  <Link
                    href={primaryHref}
                    className="btn btn-primary min-h-14 w-full px-7 text-base sm:w-auto sm:min-w-56 sm:text-lg"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper/15 text-paper"
                    >
                      <LandingIcon name="leaf" className="size-4" />
                    </span>
                    {copy.primaryLabel}
                  </Link>
                ) : null}
                {secondaryHref && copy.secondaryLabel ? (
                  <Link
                    href={secondaryHref}
                    className="btn btn-secondary min-h-14 w-full border-line px-7 text-base shadow-[var(--shadow-card)] sm:w-auto sm:text-lg"
                  >
                    {copy.secondaryLabel}
                    <LandingIcon name="arrow" className="size-5" />
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* The drawing puts «+1,200 مستثمر تونسي انضم لينا» here, over four investor portraits. There
                are twenty participants, we hold no portraits and no consent to publish any, and the same
                drawing contradicts itself with «+0 مستثمر» four inches away. Nothing is rendered in this
                slot: the real participant count is in the figures slab, where it comes from
                million_progress() and appears only while it is greater than zero. On a page whose whole
                argument is «بلا وعود», an invented crowd is the one thing that must never ship. */}
          </div>

          <div className="flex flex-col gap-cozy lg:justify-between lg:gap-roomy">
            {promises.length > 0 ? (
              /* THE FLOATING PROMISES CARD. It hangs beside the headline at desktop, translucent over the
                 sky with a blur behind it. At 375 it cannot float beside anything, so it becomes a plain
                 full-width card under the buttons, opaque and settled rather than hovering: a translucent
                 card over a photograph, read on a phone in sunlight, is the commonest readability failure
                 on a page like this one. The rows stay ROWS at every width — three columns of 100px break
                 «أصل حقيقي وملموس» into three ragged lines.
                 No filter on any ancestor of this card: a `drop-shadow-[…]` above it makes `backdrop-blur`
                 a no-op, which is the lesson the old hero already wrote down. */
              <div className="card border-transparent p-card shadow-[var(--shadow-card)] lg:w-[16.5rem] lg:bg-surface/92 lg:p-roomy lg:shadow-[var(--shadow-float)] lg:backdrop-blur-sm">
                <ul className="grid gap-cozy lg:gap-roomy">
                  {promises.map((promise) => (
                    <li key={promise.title} className="flex items-center gap-snug">
                      <span
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-forest lg:size-12"
                      >
                        <LandingIcon name={promise.icon} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug text-forest">{promise.title}</span>
                        {promise.text ? (
                          <span className="mt-0.5 block text-caption leading-6 text-muted">{promise.text}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stats}
          </div>
        </div>
      </div>

      {/* The paper ground rises over the photograph in a very shallow arc, highest at the inline-start —
          the drawing's own foot. `preserveAspectRatio="none"` lets one path stretch to any width. */}
      <svg
        viewBox="0 0 1440 56"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-x-0 bottom-0 h-8 w-full sm:h-14"
      >
        <path d="M0 56V34C380 18 900 2 1440 4v52Z" fill="var(--color-paper)" />
      </svg>
    </section>
  );
}
