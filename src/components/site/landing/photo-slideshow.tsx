import { SitePhoto } from "@/components/site/site-photo";
import { mediaFor, type PublicConfig } from "@/lib/config";

/**
 * The hero photograph, one picture at a time.
 *
 * WHAT THIS REPLACES. <PhotoMarquee> runs a strip of photographs past the frame on a loop that never stops.
 * Nothing is ever still: there is no moment where a visitor is looking at a photograph rather than at
 * photographs moving, and on a screen whose job is «this is a real grove» that is the wrong kind of alive
 * (owner, 2026-09-22: «i don't like it, consistent slide … each idle something, not like that»).
 *
 * WHAT IT DOES INSTEAD. Each picture holds the frame for `dwell`, then SLIDES away while the next takes its
 * place over `slide` (owner, same day: «a sliding and faster, not a fade … 1.2 sec or less»). A hand-over
 * between two stills, not a drift: the eye reads a photograph, it leaves, the next arrives. The defaults are
 * 1.2s held and 0.45s travelling, and both are props — the pace is one number, not a rebuild.
 *
 * HOW THE LOOP CLOSES. The list is rendered TWICE and the track travels exactly half its width, so the last
 * step lands on a copy of the first frame and the reset is invisible. That is the same trick .marquee uses,
 * stepped instead of continuous, and it is why nothing here counts anything: upload a sixth photograph and
 * it joins the strip with no change to the arithmetic. The second copy is aria-hidden — it is the same
 * pictures, and their alt text belongs to them once.
 *
 * Still a server component: no JavaScript reaches the browser. The keyframes are generated into a <style>
 * beside the track because a keyframe's percentages cannot come from a CSS variable, and these depend on how
 * many photographs the owner uploaded.
 *
 * One photograph renders as one photograph with no animation: a single picture sliding into itself is a
 * stutter, not a slideshow.
 */

export type PhotoSlideshowProps = {
  config: PublicConfig;
  /** Media slots to run through, in order. Slots with no upload are skipped. */
  slots: readonly string[];
  sizes?: string;
  /** Reserves the ratio for a hero that sits in the flow. Omit for one that fills a positioned parent. */
  aspect?: string;
  /** Seconds each photograph holds the frame before it slides away. */
  dwell?: number;
  /** Seconds the slide itself takes. */
  slide?: number;
  priority?: boolean;
  className?: string;
};

export function PhotoSlideshow({
  config,
  slots,
  sizes = "100vw",
  aspect,
  dwell = 1.2,
  slide = 0.45,
  priority,
  className = "",
}: PhotoSlideshowProps) {
  const shown = slots.filter((slot) => mediaFor(config, slot));

  // Nothing uploaded: SitePhoto draws its own branded stand-in, as every other hero does.
  if (shown.length === 0) {
    return (
      <SitePhoto
        config={config}
        slot={slots[0] ?? ""}
        aspect={aspect}
        fill={!aspect}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    );
  }

  if (shown.length === 1) {
    return (
      <SitePhoto
        config={config}
        slot={shown[0]}
        aspect={aspect}
        fill={!aspect}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    );
  }

  const count = shown.length;
  const step = 100 / (count * 2);
  const cycle = count * (dwell + slide);
  const pct = (seconds: number) => Math.round((seconds / cycle) * 10000) / 100;
  const name = `az-slide-${count}`;

  // One pair of frames per stop: hold where you are, then travel to the next.
  const stops: string[] = [];
  for (let i = 0; i <= count; i += 1) {
    const at = i * (dwell + slide);
    const x = `translateX(${Math.round(i * step * 100) / 100}%)`;
    stops.push(`${pct(at)}%{transform:${x}}`);
    if (i < count) stops.push(`${pct(at + dwell)}%{transform:${x}}`);
  }
  const keyframes = `@keyframes ${name}{${stops.join("")}}`;

  const frames = [...shown, ...shown];

  return (
    <div
      className={`az-slideshow relative isolate overflow-hidden ${aspect ? "" : "size-full"} ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <style>{keyframes}</style>
      {/* The document is RTL at the root and never anything else, so the first frame sits at the RIGHT edge
          and the strip overflows to the left: the track travels toward positive x. */}
      <div
        className="az-slide-track flex h-full"
        style={{
          inlineSize: `${count * 2 * 100}cqw`,
          animationName: name,
          animationDuration: `${cycle}s`,
          animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
          animationIterationCount: "infinite",
        }}
      >
        {frames.map((slot, index) => (
          <div
            key={`${slot}-${index}`}
            className="relative h-full flex-none"
            style={{ inlineSize: "100cqw" }}
            aria-hidden={index >= count}
          >
            <SitePhoto
              config={config}
              slot={slot}
              fill
              sizes={sizes}
              priority={priority && index === 0}
              className="size-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
