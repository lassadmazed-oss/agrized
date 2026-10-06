"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import Link from "@/components/site/link";
import { ShareButton, ShareMark } from "@/components/site/share-button";
import { useDir, useLocale, useLocaleHref, useT } from "@/lib/i18n/client";

import { clockText, GROVE_ZONE, useMinute } from "./time";

export type TourAction = { href: string; label: string; tone: "primary" | "light"; external?: boolean };

export type TourScene = {
  key: string;
  /** What fills the screen: a photograph, or — for an interactive scene — the map or the video. */
  backdrop: ReactNode;
  /** A map or a video owns the pointer: it is not a tap-to-advance surface and does not move on by itself. */
  interactive?: boolean;
  /** How long the scene stays before the next one; ignored for an interactive scene and the last one. */
  seconds?: number;
  eyebrow?: string;
  title?: string;
  text?: string;
  rows?: { label: string; value: string }[];
  actions?: TourAction[];
  /** The welcome scene carries the grove's own clock, live. */
  clock?: boolean;
};

const subscribeVisibility = (callback: () => void) => {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
};
const pageHidden = () => document.visibilityState === "hidden";
const serverVisible = () => false;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const prefersStill = () => window.matchMedia(REDUCED).matches;

/**
 * «زيارة افتراضية» (0130, owner 2026-10-05: «something like a virtual visit, something special»).
 *
 * The offer told as a story, the way a phone already tells them: full screen, a bar of segments at the top,
 * one scene at a time — arriving, the photographs one by one, the land, the trees, where exactly it is, and
 * a last scene that asks «عجبتك الضيعة؟». A slow drift on each photograph so a still picture reads as a place
 * someone is standing in.
 *
 * HOW IT IS DRIVEN, so it works for a thumb, a mouse and a keyboard alike:
 *   · a tap on the reading-start third goes back, anywhere else goes forward — the start edge is the RIGHT in
 *     Arabic, so the gesture is mirrored, not translated;
 *   · a horizontal swipe does the same; holding a finger down pauses, as in every story player;
 *   · ← → and Space and Escape; the round arrows on a wide screen;
 *   · the segment's own CSS animation is the timer — pausing is `animation-play-state`, and the scene moves on
 *     when the animation ends, so there is no second clock to keep in step. A hidden tab pauses too, and a
 *     visitor who asked for less motion gets no timer at all.
 *
 * A map or a video takes the pointer, so those scenes have no tap zones and no timer. Only the scene before,
 * the scene shown and the scene after are mounted: the next photograph is loading while this one is read, and a
 * twenty-picture offer does not download twenty pictures to show the first.
 */
export function VirtualTour({ name, backHref, scenes }: { name: string; backHref: string; scenes: TourScene[] }) {
  const t = useT();
  const locale = useLocale();
  const dir = useDir();
  const href = useLocaleHref();
  const router = useRouter();
  const minute = useMinute();
  const hidden = useSyncExternalStore(subscribeVisibility, pageHidden, serverVisible);
  // Asked for less motion: nothing moves on by itself — the visitor turns every page (see globals.css).
  const still = useSyncExternalStore(subscribeMotion, prefersStill, serverVisible);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const press = useRef<{ x: number; y: number; at: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const last = scenes.length - 1;
  const scene = scenes[index];
  const timed = !scene.interactive && index < last && !still;
  const running = timed && !paused && !held && !hidden;

  const go = useCallback((step: number) => setIndex((current) => Math.min(Math.max(current + step, 0), last)), [last]);
  const close = useCallback(() => router.push(href(backHref)), [router, href, backHref]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A chooser open over the visit (share) owns the keyboard: Escape closes it, not the visit.
      if (document.querySelector("[data-choice-panel]")) return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") go(dir === "rtl" ? 1 : -1);
      else if (event.key === "ArrowRight") go(dir === "rtl" ? -1 : 1);
      else if (event.key === " " && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, dir, go]);

  // The page under the tour holds still, and the keyboard starts inside it.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    stage.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  const isControl = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("a, button, iframe, [data-tour-control]"));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scene.interactive || isControl(event.target)) return;
    press.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    setHeld(true);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    setHeld(false);
    if (!start || scene.interactive || isControl(event.target)) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      // A swipe toward the reading start brings the next scene in, as a page turns.
      go((dir === "rtl" ? dx > 0 : dx < 0) ? 1 : -1);
      return;
    }
    // A long press was a pause, not a tap.
    if (event.timeStamp - start.at > 350 || Math.abs(dy) > 48) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fromStart = dir === "rtl" ? rect.right - event.clientX : event.clientX - rect.left;
    go(fromStart < rect.width * 0.3 ? -1 : 1);
  };
  const release = () => {
    press.current = null;
    setHeld(false);
  };

  return (
    <div
      ref={stage}
      role="dialog"
      aria-modal="true"
      aria-label={`${t("ui.tour.open")} · ${name}`}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(event) => {
        // A long press on a phone opens the image menu; here it means «hold».
        if (!scene.interactive) event.preventDefault();
      }}
      className="fixed inset-0 z-[95] touch-pan-y select-none overflow-hidden bg-forest-700 text-paper outline-none"
    >
      {scenes.map((item, i) =>
        Math.abs(i - index) <= 1 ? (
          <Scene
            key={item.key}
            scene={item}
            active={i === index}
            clock={item.clock && minute !== null ? t("ui.tour.now_here", { time: clockText(minute * 60_000, GROVE_ZONE, locale) }) : null}
            hint={i === 0 ? t("ui.tour.hint") : null}
          />
        ) : null,
      )}

      {/* The top: a segment per scene, then close · name · pause. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-ink/55 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-3xl gap-1" aria-hidden="true">
          {scenes.map((item, i) => (
            <span key={item.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-paper/30">
              {i < index || (i === index && !timed) ? (
                <span className="block size-full bg-paper" />
              ) : i === index ? (
                <span
                  key={`${item.key}-${index}`}
                  className="tour-fill block size-full bg-paper"
                  style={{
                    animationDuration: `${item.seconds ?? 7}s`,
                    animationPlayState: running ? "running" : "paused",
                  }}
                  onAnimationEnd={() => go(1)}
                />
              ) : null}
            </span>
          ))}
        </div>
        <div className="pointer-events-auto mx-auto mt-3 flex max-w-3xl items-center gap-2">
          <Link
            href={backHref}
            aria-label={t("ui.tour.close")}
            className="grid size-10 flex-none place-items-center rounded-full bg-ink/35 text-paper backdrop-blur-sm hover:bg-ink/55"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-paper/95">{name}</p>
          {/* «شارك الزيارة»: this visit, to WhatsApp and the rest (share-button.tsx). Its chooser opens over the
              tour; while it is open the visit holds still, so nobody misses a scene choosing an app. */}
          {/* Its chooser is a portal, but React still bubbles its presses through here: they stop at this
              span, so a tap inside the chooser never turns the visit's page. */}
          <span
            onPointerDown={(event) => {
              event.stopPropagation();
              setPaused(true);
            }}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <ShareButton
              text={name}
              ariaLabel={t("ui.tour.share")}
              className="grid size-10 flex-none place-items-center rounded-full bg-ink/35 text-paper backdrop-blur-sm hover:bg-ink/55"
            >
              <ShareMark className="size-5" />
            </ShareButton>
          </span>
          {timed ? (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? t("ui.tour.play") : t("ui.tour.pause")}
              aria-pressed={paused}
              className="grid size-10 flex-none place-items-center rounded-full bg-ink/35 text-paper backdrop-blur-sm hover:bg-ink/55"
            >
              {paused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="currentColor">
                  <rect x="6.5" y="5" width="4" height="14" rx="1" />
                  <rect x="13.5" y="5" width="4" height="14" rx="1" />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* The round arrows, for a mouse. A phone has the whole screen to tap. */}
      <div className="pointer-events-none absolute inset-y-0 inset-x-4 z-10 hidden items-center justify-between md:flex">
        <ArrowButton label={t("ui.tour.prev")} onClick={() => go(-1)} disabled={index === 0} back />
        <ArrowButton label={t("ui.tour.next")} onClick={() => go(1)} disabled={index === last} />
      </div>

      {/* What a screen reader hears when the scene changes. */}
      <p className="sr-only" aria-live="polite">
        {[scene.eyebrow, scene.title].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function Scene({ scene, active, clock, hint }: { scene: TourScene; active: boolean; clock: string | null; hint: string | null }) {
  return (
    <section
      aria-hidden={!active}
      inert={!active}
      className={`absolute inset-0 transition-opacity duration-700 ease-out ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {scene.interactive ? (
        // A map or a video: framed on the forest ground, with its title above it and its way out below.
        <div className="flex size-full flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-28 sm:px-8 md:px-24">
          <div className="mx-auto w-full max-w-4xl">
            {scene.eyebrow ? <Eyebrow>{scene.eyebrow}</Eyebrow> : null}
            {scene.title ? <h2 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-5xl">{scene.title}</h2> : null}
          </div>
          <div className="mx-auto mt-4 flex min-h-0 w-full max-w-4xl flex-1 items-center">
            <div className="relative size-full overflow-hidden rounded-3xl bg-forest shadow-[var(--shadow-float)]">{scene.backdrop}</div>
          </div>
          {scene.actions?.length ? (
            <div className="mx-auto mt-4 w-full max-w-4xl">
              <Actions actions={scene.actions} />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`absolute inset-0 ${active ? "tour-drift" : ""}`}>{scene.backdrop}</div>
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-ink/85 via-ink/25 to-ink/30" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10 md:px-24 md:pb-14">
            <div className="mx-auto max-w-3xl">
              {scene.eyebrow ? <Eyebrow>{scene.eyebrow}</Eyebrow> : null}
              {scene.title ? (
                <h2 className="mt-3 font-display text-[2.6rem] font-bold leading-[1.05] text-balance drop-shadow-sm sm:text-6xl">
                  {scene.title}
                </h2>
              ) : null}
              {scene.text ? <p className="mt-3 max-w-2xl text-base leading-7 text-paper/90 sm:text-lg sm:leading-8">{scene.text}</p> : null}
              {clock ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-gold-bright">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  {clock}
                </p>
              ) : null}
              {scene.rows?.length ? (
                <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {scene.rows.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-paper/15 bg-paper/10 p-3 backdrop-blur-md">
                      <dt className="text-[0.75rem] leading-tight text-paper/75">{row.label}</dt>
                      <dd className="mt-1 font-display text-2xl font-bold leading-tight text-paper">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {scene.actions?.length ? (
                <div className="mt-6">
                  <Actions actions={scene.actions} />
                </div>
              ) : null}
              {hint ? (
                <p className="mt-6 flex items-center gap-2 text-caption text-paper/70">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5a1.5 1.5 0 0 1 3 0v1m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.8-2.4L4.4 15.7a1.5 1.5 0 0 1 2.3-1.9L9 16" />
                  </svg>
                  {hint}
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/15 px-3 py-1 text-caption font-semibold text-paper backdrop-blur-md">
      {children}
    </span>
  );
}

function Actions({ actions }: { actions: TourAction[] }) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
      {actions.map((action) => {
        const className = `btn min-h-13 gap-2 ${
          action.tone === "primary" ? "btn-primary bg-gold-bright text-ink hover:bg-gold-soft" : "border border-paper/40 bg-paper/10 text-paper backdrop-blur-md hover:bg-paper/20"
        }`;
        return action.external ? (
          <a key={action.href} href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
            {action.label} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <Link key={action.href} href={action.href} className={className}>
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}

function ArrowButton({ label, onClick, disabled, back }: { label: string; onClick: () => void; disabled: boolean; back?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="pointer-events-auto grid size-12 place-items-center rounded-full bg-ink/30 text-paper backdrop-blur-sm transition-opacity hover:bg-ink/50 disabled:opacity-0"
    >
      {/* Drawn pointing to the reading end in Arabic (left); mirrored for the other four, turned for «back». */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className={`size-6 ${back ? "-scale-x-100 ltr:scale-x-100" : "ltr:-scale-x-100"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 6 8.5 12l6 6" />
      </svg>
    </button>
  );
}
