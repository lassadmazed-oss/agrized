import { landingIconName, LandingIcon, type LandingIconName } from "@/components/site/landing/hero";
import { settingJson, type PublicConfig } from "@/lib/config";

/*
 * The quiet line that closes the hero screen: five assurances on the paper ground, separated by
 * hairlines, with no card, no border and no shadow of their own.
 *
 * IT RENDERS NOTHING TODAY, ON PURPOSE. The drawing's five labels — «مساهمة في بينة أفضل» (a typo for
 * «بيئة»), «فريق محلي في الميدان» printed twice with two different icons, «متابعة وصيانة», «عقد قانوني
 * واضح» — are claims about how AgriZed operates. «عقد قانوني واضح» and «متابعة وصيانة» are promises, and
 * a promise that cannot be edited or deleted from the Back Office is the worst thing to leave in the code
 * of a page whose whole argument is «بلا وعود». So the strip reads `site.trust_points` and hides itself
 * while the key is empty, exactly as `site.facts`, `site.how_it_works` and `site.faq` already do.
 *
 * NOT reused for this: `option_items` list «agrized_service». Those are the follow-up services AgriZed
 * SELLS for a known fee (report v3 §36, and `site.services_note` says so out loud). Showing them here as
 * free assurances would quietly turn a price into a promise.
 */

export type TrustPoint = { text: string; icon: LandingIconName };

type PointRow = { text?: unknown; icon?: unknown };

export function trustPoints(config: PublicConfig): TrustPoint[] {
  const rows = settingJson<PointRow[]>(config, "site.trust_points", []);
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const text = typeof row?.text === "string" ? row.text.trim() : "";
    return text ? [{ text, icon: landingIconName(row?.icon) }] : [];
  });
}

export function TrustStrip({ points }: { points: TrustPoint[] }) {
  if (points.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-section sm:px-6">
      {/* AT 375 THE HAIRLINES GO and the row becomes two columns. Five items on one line is about 1250px
          of content; the alternatives were five two-word columns or a strip the reader has to swipe, and
          a swipe hides assurances, which defeats having them. An odd last item spans the row so nothing
          sits alone in a half-width cell.
          From lg it is the drawing's line: centred, one row, a short centred rule between neighbours. */}
      <ul className="grid grid-cols-2 gap-x-cozy gap-y-snug [&>*:last-child:nth-child(odd)]:col-span-2 lg:flex lg:flex-wrap lg:items-center lg:justify-center lg:gap-0">
        {points.map((point, index) => (
          <li
            key={point.text}
            className="relative flex items-center gap-tight text-caption leading-6 text-ink sm:text-base lg:gap-snug lg:px-10"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="absolute start-0 top-1/2 hidden h-6 w-px -translate-y-1/2 bg-line-strong lg:block"
              />
            ) : null}
            {/* The glyph leads its label, which is what the drawing does here and the reading order an
                RTL page wants: the eye meets the mark before the words. */}
            <LandingIcon name={point.icon} className="size-5 shrink-0 text-forest lg:size-6" />
            {point.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
