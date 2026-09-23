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
  /** Seconds each photograph takes to cross. The whole loop is this times the number of photographs. */
  seconds?: number;
  /**
   * Which frames are fetched up front.
   *
   * «all» for the strip a visitor actually lands on; «first» for the other one. BOTH heroes are in the DOM
   * at every width — one is `md:hidden`, the other `hidden md:block` — and a hidden image with priority on
   * it still downloads. Marking every frame of both as priority meant twenty image requests to show five
   * pictures, which is most of why the owner called the page slow. «first» keeps the hidden hero to one.
   */
  eager?: "all" | "first";
  priority?: boolean;
  className?: string;
};

export function PhotoMarquee({
  config,
  slots,
  sizes = "100vw",
  aspect,
  seconds = 9,
  eager = "all",
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
    shown.map((slot, index) => (
      <div key={`${copy}-${slot}`} className="marquee-photo">
        {/* THE SECOND COPY IS NEVER FETCHED SEPARATELY — it is the same URLs as the first, so the browser
            serves it from cache and a lazy frame there resolves instantly. What must NOT be lazy is the
            first copy of the strip a visitor is looking at: a lazy frame only starts its request when the
            track carries it into view, and until it lands the reader watches SitePhoto's leaf-green ground
            slide past instead of a photograph. Hence `eager`: the visible hero preloads its whole first
            copy, and the one hidden behind a breakpoint preloads a single frame. */}
        <SitePhoto
          config={config}
          slot={slot}
          fill
          sizes={sizes}
          priority={priority && copy === 0 && (eager === "all" || index === 0)}
        />
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
      <div className="marquee-track h-full" style={{ ["--marquee-gap" as string]: "0px" }}>
        {frames(0)}
        <div aria-hidden="true" className="contents">
          {frames(1)}
        </div>
      </div>
    </div>
  );
}
