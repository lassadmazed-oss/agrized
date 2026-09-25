"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerText } from "./answer-text";

/**
 * The assistant, as a pinned circle and a centred panel.
 *
 * IT USED TO BE DRAGGABLE and it is not any more (owner, 2026-09-23: «i don't like how it's movable»). The
 * defence was that a fixed circle covers something on some page and the reader should be able to shove it
 * aside. What that bought in practice was a control nobody could find twice: it sat somewhere different on
 * every screen, it moved under a thumb that meant to press it, and a tap that wobbled six pixels was a drag.
 * It now sits at the end edge above the tab bar, always, and the machinery that moved and remembered it —
 * the spot ref, the clamp, the localStorage entry, the resize handler — went with it.
 *
 * THE PANEL IS CENTRED rather than hanging off the circle's corner: a bottom sheet on a phone, a centred
 * card from `sm`. A conversation is the thing you are doing while it is open, so it belongs in the middle of
 * the screen and not pinned to the button that opened it.
 *
 * WHAT THE PANEL KNOWS. Nothing. It posts a question to /api/assistant and prints what comes back. The
 * offers, the prices, the persona and the limits are assembled on the server on every request, so this file
 * holds no business values and cannot fall out of date.
 */
const BUBBLE = 56; // px, matches size-14

import type { AssistantOfferCard } from "@/lib/assistant";

type Message = {
  role: "user" | "assistant";
  content: string;
  allowed?: string[];
  /** The open offers at the moment this answer was written; the cards under it are drawn from these. */
  offers?: AssistantOfferCard[];
};

export type AssistantCopy = {
  title: string;
  tagline: string;
  greeting: string;
  suggestions: string[];
  unavailable: string;
};

export function AssistantBubble({ copy }: { copy: AssistantCopy }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const bubble = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

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
          | { ok: true; answer: string; allowedHrefs: string[]; offers?: AssistantOfferCard[] }
          | { ok: false; message?: string }
          | null;

        setMessages((current) => [
          ...current,
          payload && payload.ok
            ? { role: "assistant", content: payload.answer, allowed: payload.allowedHrefs, offers: payload.offers }
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

  /*
   * The follow-ups stay on the table.
   *
   * They used to appear only while the thread was empty, so a visitor got one set of openings and then a
   * blank box for every turn after it — which is the moment they most need somewhere to go (owner,
   * 2026-09-24: «I want it to give more than one answer»). They are shown whenever the assistant has just
   * spoken and nothing is in flight: an answer, then the things you might ask next.
   */
  const last = messages[messages.length - 1];
  const showSuggestions =
    copy.suggestions.length > 0 && !busy && (messages.length === 0 || last?.role === "assistant");

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label={copy.title}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[30rem] flex-col overflow-hidden
                     rounded-t-2xl border border-line bg-surface shadow-float
                     h-[min(32rem,85dvh)]
                     sm:inset-0 sm:my-auto sm:rounded-2xl"
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
                  {(() => {
                    // Matched once, used twice: the sentence stops linking what the cards below already
                    // carry, so three offers are offered three times, not six.
                    const carded = offersNamedIn(message.content, message.offers ?? []);
                    return (
                      <>
                        <AnswerText
                          text={message.content}
                          allowed={message.allowed ?? []}
                          plain={new Set(carded.map((offer) => offer.href))}
                        />
                        <OfferCards offers={carded} />
                      </>
                    );
                  })()}
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
        IT DOES NOT MOVE ANY MORE (owner, 2026-09-23: «i don't like how it's movable»).
        Dragging was defended as letting a visitor shove the circle off whatever it covers, but a control that
        wanders is a control nobody can find twice: it lands somewhere different on every screen, it moves
        under a thumb that meant to press it, and its position is remembered by nothing. It sits at the end
        edge, above the tab bar, always.
      */}
      <button
        ref={bubble}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "سكّر المساعد" : copy.title}
        aria-expanded={open}
        style={{ width: BUBBLE, height: BUBBLE }}
        className="fixed z-50 grid place-items-center rounded-full bg-forest text-surface shadow-float
                   transition-transform active:scale-95
                   end-3 bottom-[calc(var(--tabbar-h)+1rem)] md:bottom-4"
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

/**
 * The offers an answer actually named, drawn as something you can press.
 *
 * WHY IT READS THE ANSWER INSTEAD OF BEING TOLD. The model is not asked to emit JSON: a small model asked
 * for prose AND a machine-readable block reliably gets one of them wrong, and the failure is silent — a
 * malformed field becomes a missing card, or worse, a card for an offer it never mentioned. What it already
 * does well is write `[الإسم](/projects/CODE)` links, because that is the one format the prompt drills. So
 * the cards are derived from the finished answer: every allowed offer path in the text, in the order it was
 * mentioned, matched against the offers the SERVER sent with that same answer.
 *
 * That makes an invented offer impossible to draw twice over — an unknown code matches nothing in the list,
 * and the list came from the server, not from the model.
 *
 * AT MOST THREE. The prompt asks for two or three comparisons; a chat panel is 30rem tall and a wall of
 * cards buries the sentence that explains them.
 */
function offersNamedIn(text: string, offers: AssistantOfferCard[]): AssistantOfferCard[] {
  const named: AssistantOfferCard[] = [];
  const mark = (offer: AssistantOfferCard | undefined) => {
    if (offer && !named.includes(offer)) named.push(offer);
  };

  const byHref = new Map(offers.map((offer) => [offer.href, offer]));
  for (const match of text.matchAll(/\((\/projects\/[A-Za-z0-9._-]{1,60})\)/g)) mark(byHref.get(match[1]));

  const byPosition = offers
    .map((offer) => ({ offer, at: offer.name.length > 3 ? text.indexOf(offer.name) : -1 }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => a.at - b.at);
  for (const row of byPosition) mark(row.offer);

  return named.slice(0, 3);
}

function OfferCards({ offers }: { offers: AssistantOfferCard[] }) {
  if (offers.length === 0) return null;

  const named = offers;

  return (
    <ul className="mt-2.5 space-y-1.5">
      {named.map((offer) => (
        <li key={offer.code}>
          <Link
            href={offer.href}
            className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5
                       transition-colors hover:border-leaf hover:bg-leaf-soft/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold text-ink">{offer.name}</span>
              <span className="block truncate text-[0.6875rem] leading-tight text-muted">
                {[offer.place, offer.priceFrom].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="flex-none rounded-pill bg-forest px-2.5 py-1 text-[0.6875rem] font-semibold text-surface"
            >
              شوف ←
            </span>
            <span className="sr-only">شوف العرض</span>
          </Link>
        </li>
      ))}
    </ul>
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
