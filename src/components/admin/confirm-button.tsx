"use client";

// One answer to «this button does something big», so the next one does not invent a second.
//
// It exists to retire the last window.confirm() in the product. That dialog is drawn left to right inside a
// right-to-left page, worded half in the browser's language and half in ours, unstyled, out of reach of every
// copy rule we have, and it stops the main thread while it waits. What it asked was «هل تريد المواصلة؟» —
// a question whose answer the reader already gave by pressing the button.
//
// It is deliberately NOT a modal. A modal owes the reader a focus trap, an Escape key, focus put back where
// it was and the rest of the page made inert: a great deal of machinery for one question. Here the button
// becomes the question in place — one sentence saying what is about to happen, and two answers under it.
// Nothing above or beside it moves, so the numbers the reader was looking at while deciding stay on screen,
// which is the whole reason they are deciding. Focus lands on the answer, Escape steps back out, and
// cancelling returns focus to the button that opened it.
//
// The words belong to the caller, and the affirmative one says what it does — «حوّل 42 ملف», never «تأكيد».
// Buttons that read «تأكيد / إلغاء» make the reader scroll their eyes back up to learn what they are
// confirming; the consequence belongs in the sentence and again in the button.

import { useEffect, useId, useRef, useState } from "react";

type ConfirmButtonProps = {
  /** The button before it asks anything. */
  label: string;
  /** What will happen, in one sentence — not «هل أنت متأكد؟». Comes from settings at the call site. */
  question: string;
  /** The answer that goes through. It names the act and its size: «حوّل 42 ملف». */
  confirmLabel: string;
  /** The answer that changes nothing. */
  cancelLabel?: string;
  /**
   * Whether this press is worth a question at all. A bulk bar asks before moving everything the search
   * matched and says nothing before moving the three rows that are ticked on screen; with `ask` false the
   * button is an ordinary button and submits on the first press.
   */
  ask?: boolean;
  /** `submit` hands the press to the surrounding form; `button` runs `onConfirm` alone. */
  type?: "button" | "submit";
  onConfirm?: () => void;
  disabled?: boolean;
  className?: string;
  confirmClassName?: string;
  cancelClassName?: string;
};

export function ConfirmButton({
  label,
  question,
  confirmLabel,
  cancelLabel = "رجوع",
  ask = true,
  type = "submit",
  onConfirm,
  disabled = false,
  className = "btn btn-primary btn-sm",
  confirmClassName = "btn btn-primary btn-sm",
  cancelClassName = "btn btn-ghost btn-sm",
}: ConfirmButtonProps) {
  const questionId = useId();
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  // Focus is only ever put back when the reader stepped back out; after a press that went through, the
  // form's own result message is what should speak next.
  const restore = useRef(false);

  // A question left open on a button whose press stopped being possible is a question about nothing, so
  // «open» is read off the props rather than stored: while the action runs, the row is the button again.
  const open = asking && ask && !disabled;

  useEffect(() => {
    if (open) answerRef.current?.focus();
    else if (restore.current) {
      restore.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const cancel = () => {
    restore.current = true;
    setAsking(false);
  };

  if (!open) {
    return (
      <button
        ref={triggerRef}
        // Armed, the first press only asks, so it must not carry the form away with it.
        type={ask ? "button" : type}
        disabled={disabled}
        onClick={ask ? () => setAsking(true) : onConfirm}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="space-y-tight rounded-xl border border-line-strong bg-paper p-snug"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {/* role=status so the sentence is announced the moment the button turns into a question. Focus moves to
          the affirmative answer, and aria-describedby makes the sentence readable from there — but describedby
          is read after the answer's own label, so a reader who never navigates back would hear «حوّل 42 ملف»
          with no idea what prompted it. The live region says it first. */}
      <p id={questionId} role="status" className="text-sm leading-6">
        {question}
      </p>
      <div className="flex flex-wrap gap-tight">
        <button
          ref={answerRef}
          type={type}
          aria-describedby={questionId}
          onClick={() => {
            restore.current = false;
            // A submit button that leaves the page during its own click never submits anything: by the time
            // the browser gets to the press, the button has no form left to belong to. So the question is
            // closed after the event, not inside it.
            if (type === "submit") setTimeout(() => setAsking(false), 0);
            else setAsking(false);
            onConfirm?.();
          }}
          className={confirmClassName}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={cancel} className={cancelClassName}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
