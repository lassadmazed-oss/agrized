import { MillionCounter, millionCounterCopy, type MillionFigures } from "@/components/site/million-counter";
import { SitePhoto } from "@/components/site/site-photo";
import type { PublicConfig } from "@/lib/config";

/**
 * «وين وصلنا؟» as the home page shows it: the counter on a dark photographic band.
 *
 * Why this is a wrapper and not three more lines inside `MillionCounter`: the counter is a plain renderer
 * that takes figures and words and knows nothing about `site_media`, and keeping it that way is what lets
 * it be dropped anywhere — a Back Office preview, a future landing page — without a config in hand. The
 * photograph is a home-page decision, so it is made here.
 *
 * THE PHOTOGRAPH is `home.coverage` (sun over vast olive groves). Five slots exist in `site_media` and the
 * home page spends each once: `home.hero` on the hero, `home.coverage` here, `home.journey` on «الزيتونة مع
 * مساحتها», `home.land` on the closing card, `home.closing` in the footer. If another section takes
 * `home.coverage`, this band should take `home.hero`'s place in that list rather than print the same
 * picture twice in one scroll. An empty slot degrades through `SitePhoto` to the drawn grove of
 * `GrovePlaceholder`, and under the band's forest scrim that reads as a deliberate ground, never a grey box.
 *
 * INTEGRATION — src/app/(public)/page.tsx section 04 becomes:
 *
 *   {progress ? <CounterBand config={config} progress={progress} /> : null}
 *
 * replacing `<MillionCounter progress={progress} copy={millionCounterCopy(config)} />` and its two imports.
 * The gate does not move: the page already reads `getMillionProgress()` only while the `public_statistics`
 * module is public, and with the module closed there is no band at all. The section keeps `id="million"`,
 * which both the header and the footer link to as `/#million`.
 */
export function CounterBand({ config, progress }: { config: PublicConfig; progress: MillionFigures }) {
  return (
    <MillionCounter
      progress={progress}
      copy={millionCounterCopy(config)}
      photo={<SitePhoto config={config} slot="home.coverage" fill sizes="100vw" />}
    />
  );
}
