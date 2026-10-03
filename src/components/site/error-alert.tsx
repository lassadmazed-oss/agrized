"use client";

import { useEffect, useRef } from "react";

/**
 * The red sentence a Server Action answered with — and the screen moving to it (owner, 2026-10-03: «if there
 * is any wrong answer or missing, direct him to it»).
 *
 * WHY THIS IS NOT focusFirstError(). That helper looks for the FIELD that is wrong, marked `aria-invalid`, and
 * the forms that validate on the client mark one. These forms do not: they hand the whole answer to the
 * server, which replies with a sentence and no field name. So the thing to move to is the sentence itself,
 * which sits directly above the fields — centring it brings both onto the screen. The two helpers must stay
 * apart for exactly that reason: a form with a marked field has to send the visitor to the FIELD, and a
 * banner at the top of the page would otherwise win on DOM order and steal them away from it.
 *
 * WHY IT WATCHES `pending` AND NOT THE SENTENCE. Submit the same wrong code twice and the server answers the
 * same string both times; an effect watching the text would not fire the second time, and the visitor — who
 * is the one most in need of being shown where to look — would get nothing. `pending` falls true→false on
 * every answer, so the edge below is one submission, whatever the sentence says.
 *
 * `tabIndex={-1}` makes a paragraph focusable without putting it in the tab order, so focus() can land here
 * but nobody tabbing through the form ever stops on it. `role="alert"` already makes a screen reader read the
 * sentence out when it appears; the move is for everyone else — on a phone, an answer printed above the fold
 * of a scrolled form is an answer nobody knows arrived.
 *
 * What it does NOT do yet: the actions answer with a sentence, not a field, so nothing here can mark the one
 * input at fault. Teaching them to name it is the next step, and then these forms call focusFirstError() too.
 */
export function ErrorAlert({ error, pending }: { error: string | null; pending: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Only on the edge where an answer has arrived: `pending` is still true while the action runs, and
    // useActionState keeps the PREVIOUS state's sentence on screen until it does.
    if (pending || !error) return;
    const alert = ref.current;
    if (!alert) return;

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    try {
      alert.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    } catch {
      // Older engines reject the options object; the focus below still brings it into view.
    }
    // preventScroll so the browser does not undo the centring with a jump of its own.
    alert.focus({ preventScroll: true });
  }, [error, pending]);

  if (!error) return null;

  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium leading-6 text-danger outline-none"
    >
      {error}
    </p>
  );
}
