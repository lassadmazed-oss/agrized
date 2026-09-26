"use client";

import { useActionState } from "react";

import { lookupRequest } from "./actions";
import { TRACK_INITIAL, TrackResult, type TrackState } from "./track-result";

/*
 * The two fields that prove a demand is yours, and the answer under them.
 *
 * ONE FORM, ONE STATE, AND THE SERVER OWNS IT. The action returns the whole state — the two values as they
 * were read, the failure sentence if there was one, and the payload if there was not — so there is no
 * client-side copy of anything to fall out of step with the answer, and a refresh cannot leave the screen
 * claiming a stage for a number the reader has since changed. The same shape the sign-in form uses
 * (src/app/(public)/zitounti/login-form.tsx), for the same reason.
 *
 * WHY BOTH FIELDS ARE REQUIRED, said on the screen and not only in a comment. A request number travels: it
 * arrives in a text message, gets forwarded, screenshotted, read out loud. On its own it is not a secret, so
 * on its own it opens nothing. The phone is what makes the pair proof — and the pair is checked as a pair, so
 * nothing on this page will ever tell you that one half was right.
 *
 * THE NUMBERS ARE `dir="ltr"` on a right-to-left page, because AGZ-2026-000045 and +216 98 124 111 are Latin
 * strings read left to right whatever the document direction is. `inputMode="tel"` gets a phone keyboard on a
 * phone; the request number takes a plain text keyboard because it carries letters and dashes.
 */

export type TrackFormProps = {
  /** The label over the request-number field, from settings so the owner can rename what the intake calls it. */
  requestLabel: string;
  requestHint: string;
  phoneLabel: string;
  phoneHint: string;
  submitLabel: string;
  /** The owner's closing line under a found demand. Null when he wrote none. */
  resultNote: string | null;
  /** The owner's word for one olive tree, from `zitounti.tree_unit`. The result card prints it beside a count. */
  treeUnit: string;
  /** The number to ring. Null while no setting holds one. */
  helpPhone: string | null;
};

export function TrackForm(props: TrackFormProps) {
  const [state, action, pending] = useActionState<TrackState, FormData>((previous, formData) => {
    // «تتبّع مطلب آخر» is a submit like any other, named by its own button: a React action may not RETURN a
    // new state from `formAction`, so the intent travels in the form data and is answered here. That keeps one
    // form, one state, and no second code path that could show a cleared form beside a stale answer.
    if (formData.get("intent") === "reset") return Promise.resolve(TRACK_INITIAL);
    return lookupRequest(previous, formData);
  }, TRACK_INITIAL);

  if (state.found) {
    return (
      <div className="space-y-4">
        <TrackResult
          found={state.found}
          helpPhone={props.helpPhone}
          note={props.resultNote}
          requestLabel={props.requestLabel}
          treeUnit={props.treeUnit}
        />

        {/* A household often sends more than one demand, and somebody who found the first one should not have
            to reload the page to look at the second. */}
        <form action={action}>
          <button type="submit" name="intent" value="reset" className="btn btn-secondary w-full border-line">
            تتبّع مطلب آخر
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-5 p-card">
      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium leading-6 text-danger">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="requestNo" className="label">
          {props.requestLabel}
        </label>
        <input
          id="requestNo"
          name="requestNo"
          type="text"
          dir="ltr"
          // `autoComplete="off"` and no `autoCapitalize`: a request number is not an identity the browser
          // should be remembering across sites, and iOS capitalising «agz» into «Agz» is handled on the server
          // anyway — but a field that visibly fights what was typed reads as broken.
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          required
          autoFocus
          defaultValue={state.requestNo}
          placeholder="AGZ-2026-000045"
          className="field text-left font-semibold tracking-wide"
        />
        <p className="mt-2 text-caption leading-6 text-muted">{props.requestHint}</p>
      </div>

      <div>
        <label htmlFor="phone" className="label">
          {props.phoneLabel}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          required
          defaultValue={state.phone}
          placeholder="98 124 111"
          className="field text-left"
        />
        <p className="mt-2 text-caption leading-6 text-muted">{props.phoneHint}</p>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary min-h-13 w-full">
        {pending ? "نلوّج…" : props.submitLabel}
      </button>

      {props.helpPhone ? (
        <p className="text-center text-caption leading-7 text-muted">
          ضيّعت رقم مطلبك؟ كلّمنا على{" "}
          <a
            href={`tel:${props.helpPhone.replace(/\s/g, "")}`}
            dir="ltr"
            className="font-semibold text-forest underline-offset-4 hover:underline"
          >
            {props.helpPhone}
          </a>
        </p>
      ) : null}
    </form>
  );
}
