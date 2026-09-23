"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerText } from "./answer-text";

/**
 * The floating assistant (owner, 2026-09-23: «a floating circle I can move around»).
 *
 * WHY IT IS DRAGGABLE AND WHY THAT IS NOT DECORATION. A fixed bubble on a phone covers something: the
 * offer page's own floating CTA, the bottom of a form, the last row of a list. Rather than pick a corner
 * that is wrong on some page, the circle is picked up and put down wherever the reader wants it, and where
 * they put it is remembered for next time.
 *
 * WHY THE POSITION IS NOT REACT STATE. Dragging fires a pointer event per frame. Held in state, each one
 * would re-render the circle *and* the open conversation behind it. The spot lives in a ref and is written
 * straight to the element's style — the one thing effects are actually for, keeping an external system (the
 * DOM) in step. React re-renders here only when the conversation changes.
 *
 * DRAG AND TAP ARE THE SAME GESTURE, so they are told apart by distance: under DRAG_SLOP pixels the pointer
 * went down and up in the same place and the reader meant to tap. Without that, every tap that wobbled by a
 * pixel would move the circle instead of opening it.
 *
 * WHAT THE PANEL KNOWS. Nothing. It posts a question to /api/assistant and prints what comes back. The
 * offers, the prices, the persona and the limits are assembled on the server on every request, so this file
 * holds no business values and cannot fall out of date.
 */

const STORAGE_KEY = "agrized.assistant.spot";
const BUBBLE = 56; // px, matches size-14
const EDGE = 12; // px kept between the circle and the viewport edge
const DRAG_SLOP = 6; // px of movement below which the gesture was a tap, not a drag

type Message = { role: "user" | "assistant"; content: string; allowed?: string[] };

export type AssistantCopy = {
  title: string;
  tagline: string;
  greeting: string;
  suggestions: string[];
  unavailable: string;
};

type Spot = { x: number; y: number };

/** Keeps the circle on screen — after a resize, a rotation, or a spot saved on a wider window. */
function clampSpot({ x, y }: Spot): Spot {
  const maxX = Math.max(EDGE, window.innerWidth - BUBBLE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - BUBBLE - EDGE);
  return { x: Math.min(Math.max(x, EDGE), maxX), y: Math.min(Math.max(y, EDGE), maxY) };
}

/** The spot the CSS below already renders: inline-start, lifted clear of the phone's tab bar. */
function defaultSpot(): Spot {
  const styles = getComputedStyle(document.documentElement);
  const rootSize = Number.parseFloat(styles.fontSize) || 16;
  const tabBar = Number.parseFloat(styles.getPropertyValue("--tabbar-h")) || 0;
  const rtl = document.documentElement.dir === "rtl";
  const x = rtl ? window.innerWidth - BUBBLE - EDGE : EDGE;
  return clampSpot({ x, y: window.innerHeight - BUBBLE - (tabBar * rootSize + 16) });
}

export function AssistantBubble({ copy }: { copy: AssistantCopy }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const bubble = useRef<HTMLButtonElement>(null);
  const spot = useRef<Spot | null>(null);
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /** Moves the circle. The element is positioned by left/top from here on, so the CSS defaults are cleared. */
  const place = useCallback((next: Spot) => {
    spot.current = next;
    const element = bubble.current;
    if (!element) return;
    element.style.insetInlineStart = "auto";
    element.style.bottom = "auto";
    element.style.left = `${next.x}px`;
    element.style.top = `${next.y}px`;
  }, []);

  // The saved spot is per-browser: the server cannot know it, so it is applied once the element exists.
  useEffect(() => {
    let saved: Spot | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Spot>;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") saved = { x: parsed.x, y: parsed.y };
      }
    } catch {
      // Private window, blocked storage, or a value from an older shape. The default spot is fine.
    }
    // Nothing to do when there is no saved spot: the CSS below already draws the circle in the default
    // place, and moving it there again would only risk a visible jump.
    if (saved) place(clampSpot(saved));
  }, [place]);

  useEffect(() => {
    const onResize = () => {
      if (spot.current) place(clampSpot(spot.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Follow the conversation as it grows.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = spot.current ?? defaultSpot();
    spot.current = current;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      dx: event.clientX - current.x,
      dy: event.clientY - current.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;

    // Measured from where the finger went down, not from the circle's clamped position: against an edge the
    // circle stops moving while the finger keeps going, and that is still a drag, not a tap.
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > DRAG_SLOP) {
      state.moved = true;
    }
    if (state.moved) place(clampSpot({ x: event.clientX - state.dx, y: event.clientY - state.dy }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (state && !state.moved) {
      setOpen((was) => !was);
      return;
    }
    if (spot.current) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spot.current));
      } catch {
        // Nothing to do: the circle simply starts from the default next time.
      }
    }
  };

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;

      setDraft("");
      setBusy(true);
      setMessages((current) => [...current, { role: "user", content: text }]);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: text,
            // The last few turns only: the facts are rebuilt server-side on every request.
            history: messages.slice(-6).map(({ role, content }) => ({ role, content })),
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; answer: string; allowedHrefs: string[] }
          | { ok: false; message?: string }
          | null;

        setMessages((current) => [
          ...current,
          payload && payload.ok
            ? { role: "assistant", content: payload.answer, allowed: payload.allowedHrefs }
            : { role: "assistant", content: payload?.message ?? copy.unavailable, allowed: [] },
        ]);
      } catch {
        setMessages((current) => [...current, { role: "assistant", content: copy.unavailable, allowed: [] }]);
      } finally {
        setBusy(false);
        field.current?.focus();
      }
    },
    [busy, messages, copy.unavailable],
  );

  const showSuggestions = messages.length === 0 && copy.suggestions.length > 0;

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label={copy.title}
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-float
                     start-3 bottom-[calc(var(--tabbar-h)+5rem)]
                     h-[min(28rem,calc(100dvh-var(--tabbar-h)-9rem))] w-[min(23rem,calc(100vw-1.5rem))]"
        >
          <header className="flex items-center gap-3 border-b border-line bg-forest px-4 py-3 text-surface">
            <span className="grid size-9 place-items-center rounded-full bg-surface/15" aria-hidden="true">
              <LeafMark />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label font-semibold">{copy.title}</span>
              {copy.tagline ? (
                <span className="block truncate text-caption text-surface/75">{copy.tagline}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="سكّر المساعد"
              className="grid size-8 place-items-center rounded-full text-surface/85 hover:bg-surface/15"
            >
              <CloseMark />
            </button>
          </header>

          <div ref={scroller} className="rail-none flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {copy.greeting ? <Turn side="assistant">{copy.greeting}</Turn> : null}

            {messages.map((message, index) =>
              message.role === "user" ? (
                <Turn key={index} side="user">
                  {message.content}
                </Turn>
              ) : (
                <Turn key={index} side="assistant">
                  <AnswerText text={message.content} allowed={message.allowed ?? []} />
                </Turn>
              ),
            )}

            {busy ? (
              <Turn side="assistant">
                <span className="inline-flex gap-1" aria-label="يكتب…">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
              </Turn>
            ) : null}

            {showSuggestions ? (
              <ul className="flex flex-wrap gap-2 pt-1">
                {copy.suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="rounded-pill border border-line bg-paper px-3 py-1.5 text-caption text-ink
                                 hover:border-leaf hover:bg-leaf-soft"
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-line bg-paper px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={field}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="أكتب سؤالك…"
              aria-label="سؤالك"
              className="min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 py-2.5 text-body
                         outline-none focus:border-leaf"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length === 0}
              aria-label="إبعث"
              className="grid size-10 flex-none place-items-center rounded-full bg-forest text-surface disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 12 4 5l3 7-3 7z" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      ) : null}

      {/*
        The inline style is the pre-drag position, written here rather than as a class so that `place()` can
        take the element over with left/top on the first drag without the two fighting.
      */}
      <button
        ref={bubble}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={open ? "سكّر المساعد" : copy.title}
        aria-expanded={open}
        style={{
          insetInlineStart: EDGE,
          bottom: "calc(var(--tabbar-h) + 1rem)",
          width: BUBBLE,
          height: BUBBLE,
        }}
        className="fixed z-50 grid touch-none place-items-center rounded-full bg-forest text-surface shadow-float
                   transition-transform active:scale-95"
      >
        {open ? <CloseMark /> : <LeafMark />}
      </button>
    </>
  );
}

/** One turn. The visitor's own words sit on the forest ground; the assistant's on the paper one. */
function Turn({ side, children }: { side: "user" | "assistant"; children: React.ReactNode }) {
  const mine = side === "user";
  return (
    <div className={mine ? "flex justify-start" : "flex justify-end"}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-body",
          mine ? "bg-forest text-surface" : "border border-line bg-paper text-ink",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}

function CloseMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

/** The olive sprig from the logo, drawn rather than loaded: it sits on a 56px circle. */
function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 21V11" strokeLinecap="round" />
      <path d="M12 12c0-3.3 2.4-6 6-6.6.5 3.7-1.8 7-6 7.2z" strokeLinejoin="round" />
      <path d="M12 16c-3 0-5.4-2.1-6-5 3.3-.4 5.8 1.6 6 4.6z" strokeLinejoin="round" />
    </svg>
  );
}
