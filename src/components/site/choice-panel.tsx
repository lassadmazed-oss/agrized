"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The one way the site asks a visitor to pick between a few things: the language (language-switcher.tsx) and
 * how to reach us (call-chooser.tsx). Owner, 2026-10-03/05: «cleaner and hell modern», «something nice and
 * clean» — so both look and behave the same.
 *
 * ON A PHONE, A SHEET from the bottom edge — where the thumb is — over a blurred veil, the page held still,
 * with a grab handle, a title and a close button. ON A WIDE SCREEN, when the caller asks for it, a DROPDOWN
 * under (or, near the foot of the window, above) the button that opened it. Both are drawn in a portal on
 * <body>, because the cards and bars that hold the buttons clip their overflow — and above everything else the
 * site floats (z 100), because the share button also opens from inside the full-screen virtual visit.
 * `data-choice-panel` marks an open one, so a full-screen owner of the keyboard can stand aside while it is.
 *
 * Escape, a press outside, a resize, and (for a dropdown) a scroll close it; focus goes to the row marked
 * `data-autofocus` (or `aria-current`) when it opens and back to the button when it closes.
 */

export type PanelState =
  | { kind: "sheet" }
  | { kind: "dropdown"; top: number | null; bottom: number | null; inlineEnd: number }
  | null;

export function useChoicePanel({ dropdownOnWide }: { dropdownOnWide: boolean }) {
  const [panel, setPanel] = useState<PanelState>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!panel) return;
    const trigger = triggerRef.current;
    const close = () => setPanel(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || trigger?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // A dropdown is pinned where its button was; once the page moves under it, it would float away from it.
    const onScroll = () => {
      if (panel.kind === "dropdown") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", close);

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    if (panel.kind === "sheet") html.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus], [aria-current="true"]')?.focus();

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", close);
      html.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [panel]);

  const toggle = () => {
    if (panel) return setPanel(null);
    const trigger = triggerRef.current;
    const wide = window.matchMedia("(min-width: 48rem)").matches;
    if (dropdownOnWide && wide && trigger) {
      const rect = trigger.getBoundingClientRect();
      const rtl = document.documentElement.dir === "rtl";
      // clientWidth, not innerWidth: the latter counts the scrollbar, which pushed the list off the button's edge.
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      // Near the foot of the window (the footer's buttons) the list opens upward instead of off the screen.
      const openUp = viewportHeight - rect.bottom < 320 && rect.top > viewportHeight - rect.bottom;
      setPanel({
        kind: "dropdown",
        top: openUp ? null : rect.bottom + 10,
        bottom: openUp ? viewportHeight - rect.top + 10 : null,
        inlineEnd: rtl ? rect.left : viewportWidth - rect.right,
      });
    } else {
      setPanel({ kind: "sheet" });
    }
  };

  return { panel, toggle, close: () => setPanel(null), triggerRef, panelRef, panelId, titleId };
}

export function ChoicePanel({
  state,
  panelRef,
  panelId,
  titleId,
  title,
  dropdownTitle,
  icon,
  closeLabel,
  onClose,
  children,
}: {
  state: PanelState;
  panelRef: React.RefObject<HTMLDivElement | null>;
  panelId: string;
  titleId: string;
  /** The sheet's heading — a question or an act: «بدّل اللغة», «كيفاش تحب تكلّمنا؟». */
  title: string;
  /** The dropdown's small label; the sheet's title when absent. */
  dropdownTitle?: string;
  /** The round mark beside the sheet's title. */
  icon: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** The rows. `kind` lets them be taller in a sheet, where they are thumb targets. */
  children: (kind: "sheet" | "dropdown") => ReactNode;
}) {
  if (!state || typeof document === "undefined") return null;

  return createPortal(
    state.kind === "dropdown" ? (
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        style={{
          top: state.top ?? undefined,
          bottom: state.bottom ?? undefined,
          insetInlineEnd: state.inlineEnd,
        }}
        data-choice-panel=""
        className="lang-pop fixed z-[100] w-72 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-float)]"
      >
        <p id={titleId} className="px-3 pb-2 pt-1 text-caption font-semibold text-muted">
          {dropdownTitle ?? title}
        </p>
        <div className="space-y-0.5">{children("dropdown")}</div>
      </div>
    ) : (
      <>
        <div aria-hidden="true" className="lang-fade fixed inset-0 z-[100] bg-forest-700/45 backdrop-blur-[2px]" />
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-choice-panel=""
          className="lang-sheet fixed inset-x-0 bottom-0 z-[101] mx-auto w-full max-w-md rounded-t-[1.75rem] bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_-20px_rgb(27_42_31/0.45)]"
        >
          <span aria-hidden="true" className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-line" />
          <div className="flex items-center gap-3 px-2 pb-3 pt-1">
            <span className="grid size-10 place-items-center rounded-full bg-leaf-soft text-forest">{icon}</span>
            <p id={titleId} className="flex-1 text-lg font-semibold text-ink">
              {title}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="grid size-10 place-items-center rounded-full text-muted hover:bg-paper"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">{children("sheet")}</div>
        </div>
      </>
    ),
    document.body,
  );
}
