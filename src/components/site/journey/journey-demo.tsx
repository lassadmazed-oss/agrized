"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatMessage } from "@/lib/i18n/message";
import type { Locale } from "@/lib/i18n/locales";

import type { DemoCopy, Scene } from "./copy";
import { SCENE_VIEWS } from "./scenes";

/**
 * The customer journey, played inside a phone (owner brief, section 1).
 *
 * HOW IT BEHAVES, which is most of the brief:
 *
 * · It plays by itself, but only while it is on screen. An IntersectionObserver starts the timer when the
 *   phone is actually in front of somebody and stops it the moment it is not — so the section is never
 *   running in a tab nobody is looking at, and a visitor who scrolls past does not come back to scene nine.
 * · It never takes the scroll. No pinning, no «stay here until the animation finishes». The brief asked for
 *   that in so many words, and it is the difference between a demo and a hostage situation.
 * · It is swipeable, with buttons for everyone else, and it stops playing the moment anybody touches a
 *   control. Somebody who has taken the wheel is not fighting a timer to read a screen.
 * · prefers-reduced-motion means it never autoplays and never slides: the scene changes, it does not travel.
 *   The controls still work, so the content is reachable, just not animated at anybody.
 * · It is eleven scenes of markup and two CSS transitions. No video, no canvas, no animation library.
 *
 * WHY THE SCENES ARE NOT UNMOUNTED between steps: they are cheap, and keeping them mounted is what lets one
 * fade out while the next fades in. Only the current one is reachable — the rest are `aria-hidden` and
 * `inert`, so a screen reader and the tab key both see exactly one screen.
 */

/** Each scene's time on screen. Eleven of these is 26.4s, inside the 20–30s the brief asked for. */
const SCENE_MS = 2400;

export function JourneyDemo({
  scenes,
  copy,
  locale,
  offersHref,
  interestHref,
}: {
  /** The owner's own list (site.journey_scenes), already in this page's language. */
  scenes: readonly Scene[];
  copy: DemoCopy;
  locale: Locale;
  offersHref: string;
  interestHref: string;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Set once the visitor uses a control: after that the demo is theirs and never restarts itself. */
  const [taken, setTaken] = useState(false);
  const [still, setStill] = useState(false);
  /** False while the tab is in the background. See the effect below for why the observer cannot cover this. */
  const [awake, setAwake] = useState(true);

  const frameRef = useRef<HTMLDivElement>(null);
  const total = scenes.length;

  // prefers-reduced-motion is read once on the client, and followed afterwards if the visitor changes it.
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const read = () => setStill(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  /**
   * Switching to another tab stops it too, and the observer CANNOT do this job on its own: a hidden document
   * is delivered no IntersectionObserver callbacks at all, so nothing fires to say «you are not being looked
   * at any more» — the element's intersection has not changed, the whole page has simply gone away. Left to
   * the observer, a demo that was playing when the tab went to the background would keep stepping through its
   * eleven scenes for as long as the tab lived.
   */
  useEffect(() => {
    const read = () => setAwake(!document.hidden);
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  // On screen → play. Off screen → stop. Never plays before it has been seen, which is also what keeps the
  // first paint cheap: nothing is moving while the page is still arriving.
  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting && !taken && !still),
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [taken, still]);

  useEffect(() => {
    if (!playing || !awake) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % total), SCENE_MS);
    return () => clearTimeout(timer);
  }, [playing, awake, index, total]);

  /** Any deliberate move: it stops the timer for good and leaves the visitor in charge. */
  const take = useCallback((next: number) => {
    setTaken(true);
    setPlaying(false);
    setIndex(((next % scenes.length) + scenes.length) % scenes.length);
    // `scenes` is the owner's list and its length decides the wrap; a closure holding the old one would send
    // «اللي بعدو» to the wrong scene the first time he adds or removes a step.
  }, [scenes.length]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - start.x;
    // A swipe, not a scroll: mostly sideways, and far enough to mean it. Otherwise the page keeps the gesture.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(point.clientY - start.y)) return;
    // The page runs right to left, so a drag towards the start of the line is «forward».
    const forward = document.dir === "rtl" ? dx > 0 : dx < 0;
    take(index + (forward ? 1 : -1));
  };

  const scene = scenes[index];
  const stepText = useMemo(
    () => formatMessage(locale, copy.stepOf, { step: index + 1, total }),
    [locale, copy.stepOf, index, total],
  );

  const heading = (
    <>
      <p className="pill mx-auto bg-gold-soft text-forest ring-1 ring-gold/30 lg:mx-0">
        <span aria-hidden className="size-1.5 rounded-full bg-gold-bright" />
        {copy.eyebrow}
      </p>
      <h2 className="section-title mt-2.5">{copy.title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted sm:text-base">{copy.lead}</p>
    </>
  );

  // An emptied site.journey_scenes is a section the owner has switched off, not a crash on scenes[0].
  if (!scene) return null;

  return (
    <section className="mt-4 md:mt-8">
      {/* On a phone the visitor must know what they are looking at BEFORE the screen starts changing. */}
      <div className="text-center lg:hidden">{heading}</div>

      <div className="mt-4 grid items-center gap-4 lg:mt-0 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
        {/* ── the phone ─────────────────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center">
          <div
            ref={frameRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="relative w-[12.5rem] touch-pan-y select-none rounded-[2rem] border-[6px] border-forest-700 bg-forest-700 shadow-[var(--shadow-float)] sm:w-[15rem]"
          >
            {/* The earpiece bar, so the frame reads as a phone without a photograph of one. */}
            <span className="absolute inset-x-0 top-1 z-10 mx-auto h-1 w-10 rounded-full bg-paper/25" />
            <div className="relative h-[21rem] overflow-hidden rounded-[1.6rem] bg-paper sm:h-[27rem]">
              {scenes.map((item, i) => (
                <div
                  key={item.key}
                  aria-hidden={i !== index}
                  // `inert` keeps the tab key and the screen reader inside the one scene on show. React 19
                  // takes it as a real boolean — an empty string is read as false and silently does nothing.
                  inert={i !== index}
                  className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${
                    i === index ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  {(() => {
                    // The drawing is looked up by the row's `key`, which is why a translated list must not
                    // change it (0127, and 077_journey.sql proves it). A key with no drawing shows nothing
                    // rather than breaking the section — the owner can add a row before anyone draws it.
                    const View = SCENE_VIEWS[item.key];
                    return View ? <View title={item.title} /> : null;
                  })()}
                </div>
              ))}
            </div>
          </div>

          {/* The dots, and the same fact in words for anybody who cannot see them. */}
          <div className="mt-3 flex items-center gap-1.5" role="group" aria-label={copy.progressLabel}>
            {scenes.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => take(i)}
                aria-label={item.title}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-forest" : "w-1.5 bg-line-strong hover:bg-leaf"}`}
              />
            ))}
          </div>
        </div>

        {/* ── what is happening, and the way in ─────────────────────────────────────────────────────── */}
        <div className="text-center lg:text-start">
          <div className="hidden lg:block">{heading}</div>

          {/* The caption under the phone. `aria-live` so the step is spoken as it changes, politely. */}
          <div aria-live="polite" className="min-h-24 rounded-2xl border border-line bg-surface p-4 text-start lg:mt-4">
            <p className="text-[0.6875rem] font-bold text-gold tabular-nums">
              {String(index + 1).padStart(2, "0")} · {stepText}
            </p>
            <p className="mt-1 font-display text-lg font-bold text-forest">{scene.title}</p>
            <p className="mt-1 text-[0.8125rem] leading-6 text-muted">{scene.line}</p>
          </div>

          {/* Back, play/pause, forward — in that order on the line, whichever way the line runs. */}
          <div className="mt-3 flex items-center justify-center gap-2 lg:justify-start">
            <Control label={copy.previous} onClick={() => take(index - 1)}>
              <Arrow className="size-4" />
            </Control>
            <Control
              label={playing ? copy.pause : copy.play}
              onClick={() => {
                if (playing) {
                  setTaken(true);
                  setPlaying(false);
                } else {
                  setTaken(false);
                  setPlaying(true);
                }
              }}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
                  <rect x="6" y="5" width="4" height="14" rx="1.2" />
                  <rect x="14" y="5" width="4" height="14" rx="1.2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4 ltr:-scale-x-100">
                  <path d="M17 12 7 18V6z" />
                </svg>
              )}
            </Control>
            <Control label={copy.next} onClick={() => take(index + 1)}>
              <Arrow className="size-4 rotate-180" />
            </Control>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center lg:justify-start">
            <Link href={interestHref} className="btn btn-primary">
              {copy.ctaPrimary}
            </Link>
            <Link href={offersHref} className="btn btn-secondary border-line">
              {copy.ctaOffers}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-forest transition-colors hover:border-leaf hover:bg-leaf-soft"
    >
      {children}
    </button>
  );
}

/** Points the way the language reads back; the forward control turns it. */
function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`${className} ltr:-scale-x-100`}>
      <path d="M4 12h16m0 0-6-6m6 6-6 6" />
    </svg>
  );
}
