"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A button, and the form it opens.
 *
 * WHY NATIVE <dialog>. showModal() puts the panel in the top layer, dims the page, traps focus, makes the
 * rest of the document inert and closes on Esc. Every one of those is something a div-with-a-z-index has to
 * reimplement, and the version everyone writes forgets the last three.
 *
 * OPEN IS STATE, NOT A REF CALL. The dialog is opened and closed from an effect that watches one boolean, so
 * nothing reads `ref.current` while rendering — and `close` handed to the content is just «set it false»,
 * which is safe to pass anywhere. `onClose` keeps that boolean honest when the browser closes the dialog by
 * itself, which Esc does.
 *
 * THE CONTENT IS MOUNTED ONLY WHILE OPEN, so every form starts clean: a half-typed CIN abandoned yesterday is
 * not still sitting there today, and a closed popup costs nothing.
 *
 * WHY A RENDER PROP: only the content knows when its action actually succeeded. A form that failed validation
 * must stay open with its message, so closing cannot be guessed here on submit or on a timer.
 */
export function Popup({
  label,
  title,
  variant = "secondary",
  block = false,
  children,
}: {
  label: ReactNode;
  title: string;
  variant?: "primary" | "secondary" | "ghost";
  block?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn btn-${variant} btn-sm ${block ? "w-full" : ""}`}
      >
        {label}
      </button>

      <dialog
        ref={ref}
        className="popup"
        onClose={close}
        onClick={(event) => {
          // The panel is a child, so a press that landed on it is not a press on the backdrop.
          if (event.target === ref.current) close();
        }}
      >
        <div className="popup-panel">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold text-forest">{title}</h2>
            <button
              type="button"
              onClick={close}
              aria-label="سكّر"
              className="ms-auto grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-forest"
            >
              ✕
            </button>
          </div>

          <div className="p-4">{open ? children(close) : null}</div>
        </div>
      </dialog>
    </>
  );
}
