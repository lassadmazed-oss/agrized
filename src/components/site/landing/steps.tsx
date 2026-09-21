import { LandingIcon, type LandingIconName } from "@/components/site/landing/hero";
import { SectionHead } from "@/components/site/landing/tree-picks";
import { howTitle } from "@/components/site/site-header";
import { settingJson, settingText, type PublicConfig } from "@/lib/config";

/** One step of «كيفاش تخدم AgriZed؟», as the owner writes it in `site.how_it_works`. */
type Step = { title: string; text: string };

type StepsProps = {
  config: PublicConfig;
};

/**
 * The lg track count for however many steps the owner left, and the inset that puts the dotted connector
 * between the first and the last medallion of that row (50 % ÷ columns from each edge).
 *
 * Written out rather than computed because Tailwind reads class names as literal strings, and for the same
 * reason million-counter.tsx:66-78 writes its own map: a count with no entry keeps a readable grid and simply
 * draws no line, instead of a line across nothing.
 */
const STEP_ROW: Record<number, { grid: string; connector: string }> = {
  3: { grid: "sm:grid-cols-3 lg:grid-cols-3", connector: "lg:inset-x-[16.7%]" },
  4: { grid: "sm:grid-cols-2 lg:grid-cols-4", connector: "lg:inset-x-[12.5%]" },
  5: { grid: "sm:grid-cols-2 lg:grid-cols-5", connector: "lg:inset-x-[10%]" },
};

/**
 * «كيفاش تخدم AgriZed؟» — the four steps, on a dark forest band.
 *
 * THE STEPS ARE DATA: `site.how_it_works` holds them, the owner can add a fifth or drop one, and the live
 * wording («اختار على قدّ إمكانياتك», «نلوّجو على الأرض المناسبة»…) is not the reference image's invented
 * «اختر زيتونتك / نزرع ونعتني», which also promises field operations the owner's own copy is careful to
 * price («بمقابل معلوم»). The image tells us where a step goes and how big it is; it never tells us what it
 * says.
 *
 * The band is flat forest rather than a photograph: it is the second dark surface of the page and it has to
 * differ from the counter band above it, which is a picture. A process is a diagram, not a place.
 *
 * Nothing here carries a figure, so PRN-01 raises nothing; nothing here names a price, so neither does PRJ-03.
 */
export function Steps({ config }: StepsProps) {
  const steps = settingJson<Step[]>(config, "site.how_it_works", []);
  if (steps.length === 0) return null;

  // No seeded row for either; the fallbacks are the ones the site already uses. `site.how_text` does not
  // exist yet, so the line under the title is simply absent rather than invented — see the report.
  const title = howTitle(config);
  const subtitle = settingText(config, "site.how_text");
  // Four steps today, but the list is the owner's: the track count and the dotted line are chosen for
  // whatever it holds, so five steps never leave a line running into an empty column.
  const row = STEP_ROW[steps.length];

  return (
    // id="how" is linked from the header menu, the footer and `site.cta_secondary_label`; losing it breaks
    // three menus at once.
    <section id="how" className="relative isolate scroll-mt-20 overflow-hidden bg-forest-700 text-paper">
      {/* The reference frames this band with blurred olive branches. We hold five rectangular photographs and
          no alpha cut-out, so the branch is DRAWN — the same vocabulary as GrovePlaceholder — at 7 %, clipped
          by the band. No negative offset: in RTL one widens the document. */}
      <Spray className="start-0 top-0" />
      <Spray className="bottom-0 end-0 rotate-180" />

      <div className="relative mx-auto max-w-6xl px-4 py-section sm:px-6 sm:py-band">
        <SectionHead title={title} subtitle={subtitle} tone="dark" />

        <ol className={`relative mt-roomy grid gap-0 sm:gap-roomy ${row?.grid ?? "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {/* The dotted line between the medallions. It is drawn first so the opaque cream circles cover it
              where they overlap, which is how the reference's dashes stop short of each circle. `inset-x`
              names no side, so it needs no mirroring, and it runs from the first medallion's centre to the
              last — which is why it appears only for a count whose lg row it was measured for. */}
          {row ? (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-7 hidden border-t border-dashed border-paper/30 lg:block ${row.connector}`}
            />
          ) : null}

          {steps.map((step, index) => (
            <li key={step.title} className="relative flex items-start gap-cozy pb-roomy text-start sm:flex-col sm:items-center sm:pb-0 sm:text-center">
              {/* At 375 the four steps are rows, so the connector turns vertical and runs from under one
                  medallion to the next. It is rendered per step rather than once across the list, so the last
                  step never trails a line into nothing. */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 start-6 top-14 border-s border-dashed border-paper/25 sm:hidden"
                />
              ) : null}

              <span className="grid size-12 flex-none place-items-center rounded-full bg-paper text-forest shadow-[var(--shadow-card)] sm:size-14">
                <LandingIcon name={STEP_ICONS[index] ?? "leaf"} className="size-6" />
              </span>

              {/* `contents` from sm up hands the title and the text to the column, so they centre under the
                  medallion; below sm they stay one block beside it. */}
              <div className="min-w-0 flex-1 sm:contents">
                <h3 className="flex items-baseline gap-tight font-display text-xl font-bold leading-tight text-paper sm:mt-cozy sm:justify-center">
                  <span dir="ltr" className="text-2xl tabular-nums text-gold-bright">
                    {index + 1}
                  </span>
                  <span>{step.title}</span>
                </h3>
                {step.text ? (
                  <p className="mt-tight max-w-[19rem] text-caption leading-6 text-paper/75">{step.text}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * The medallion glyphs, indexed by position and nothing else, from the landing page's own set (hero.tsx).
 *
 * They read against the LIVE steps rather than against the drawing's invented ones: choose what fits you
 * (calculator), we look for the land (map), we tell you about the matching project (document), you own it
 * (tree). They are decoration — a step the owner adds from the Back Office falls back to the leaf and still
 * renders, because an icon must never be the thing that decides whether a step appears.
 */
const STEP_ICONS: LandingIconName[] = ["calculator", "map", "document", "tree"];

/** An olive spray, drawn rather than photographed, framing the band. Purely decorative. */
function Spray({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className={`pointer-events-none absolute hidden size-56 text-paper/[0.07] lg:block ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 6c22 10 40 28 52 52" />
      <path d="M18 8c6 7 6 16 0 21-7-5-7-14 0-21ZM34 22c7 6 7 15 0 20-6-5-6-14 0-20ZM50 38c7 6 7 15 0 20-6-5-6-14 0-20Z" />
      <path d="M8 22c8 4 12 12 11 20-8 0-14-7-11-20ZM24 40c8 4 12 12 11 20-8 0-14-7-11-20Z" />
      <circle cx="62" cy="66" r="6" />
      <circle cx="74" cy="80" r="5" />
    </svg>
  );
}
