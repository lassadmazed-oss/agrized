import { SitePhoto } from "@/components/site/site-photo";
import { mediaFor, type PublicConfig } from "@/lib/config";

/**
 * The hero photograph, drifting (owner, 2026-09-21: «add more than img animation sliding never stop loop…
 * to make it look more alive»).
 *
 * It is the site's own uploaded photography and nothing else. `slots` is a preference order, and a slot with
 * no upload behind it is dropped rather than drawn as a placeholder — the same rule SitePhoto keeps for one
 * picture, applied to a strip. With one photograph left it renders that photograph and no animation at all,
 * because a strip of one thing sliding is just a picture that will not sit still.
 *
 * The loop is seamless because the list is rendered TWICE and the track travels exactly -50% (.marquee in
 * globals.css). That is also why nothing here counts anything: upload a sixth photograph and it joins the
 * strip with no change to the CSS. The second copy is aria-hidden — it is the same pictures, and their alt
 * text belongs to them once.
 *
 * Server component. No JavaScript reaches the browser for any of this.
 */

export type PhotoMarqueeProps = {
  config: PublicConfig;
  /** Media slots to run through, in order. Slots with no upload are skipped. */
  slots: readonly string[];
  /** Passed to next/image. The frames are viewport-wide, so the default is right for a full-bleed hero. */
  sizes?: string;
  /** Reserves the ratio, for a hero that sits in the flow. Omit for one that fills a positioned parent. */
  aspect?: string;
  /** Seconds for one full pass of the whole strip. Slower reads as weather; faster reads as a slideshow. */
  seconds?: number;
  priority?: boolean;
  className?: string;
};

export function PhotoMarquee({
  config,
  slots,
  sizes = "100vw",
  aspect,
  seconds = 48,
  priority,
  className = "",
}: PhotoMarqueeProps) {
  const shown = slots.filter((slot) => mediaFor(config, slot));

  // Nothing uploaded: hand the first slot to SitePhoto and let it draw its own branded stand-in, exactly as
  // the page did before this component existed.
  if (shown.length === 0) {
    return <SitePhoto config={config} slot={slots[0] ?? ""} aspect={aspect} fill={!aspect} sizes={sizes} priority={priority} className={className} />;
  }

  if (shown.length === 1) {
    return <SitePhoto config={config} slot={shown[0]} aspect={aspect} fill={!aspect} sizes={sizes} priority={priority} className={className} />;
  }

  const frames = (copy: number) =>
    shown.map((slot) => (
      <div key={`${copy}-${slot}`} className="marquee-photo">
        {/* EVERY frame is eager, both copies, and the second copy is the reason. It was lazy at first, which
            is the obvious choice and the wrong one here: a lazy frame is off-screen until the track carries
            it in, so it began its request at the moment it became visible and showed SitePhoto's leaf-green
            ground for as long as it took — a pale panel sliding into the hero every cycle. There is no
            second download to save, because the two copies are the same five URLs; the browser dedupes them
            and the second set is served from cache. */}
        <SitePhoto config={config} slot={slot} fill sizes={sizes} priority={priority} />
      </div>
    ));

  return (
    <div
      className={`marquee ${aspect ? "" : "absolute inset-0"} ${className}`.trim()}
      style={{
        ...(aspect ? { aspectRatio: aspect.replace("/", " / ") } : null),
        // One pass shows every photograph once, so more photographs means a longer loop, not a faster one.
        ["--marquee-duration" as string]: `${seconds * shown.length}s`,
      }}
    >
      <div className="marquee-track h-full">
        {frames(0)}
        <div aria-hidden="true" className="contents">
          {frames(1)}
        </div>
      </div>
    </div>
  );
}
