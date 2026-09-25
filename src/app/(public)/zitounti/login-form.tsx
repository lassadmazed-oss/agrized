"use client";

import { useActionState } from "react";

import { requestCode, submitCode } from "./actions";
import { LOGIN_INITIAL, type LoginState } from "./login-state";

/*
 * The buyer's sign-in, in two steps: the number, then the code that was sent to it.
 *
 * ONE FORM, TWO ACTIONS, and the step decides which. Splitting it into two components would mean holding
 * the phone number in a third place and keeping it in step; here the server action returns the whole state
 * — including which half to draw — so there is exactly one source of truth and a refresh cannot desync it.
 *
 * THE NUMBER IS `inputMode="tel"` AND `dir="ltr"`, because a phone number is Latin digits read left to
 * right even on a right-to-left page, and a phone keyboard is what a buyer should get on a phone. The code
 * is `inputMode="numeric"` with `autoComplete="one-time-code"`, which is what lets iOS and Android offer
 * the code straight from the SMS notification instead of making somebody memorise six digits and switch
 * apps to type them.
 */

export function ClientLoginForm({ helpPhone }: { helpPhone: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>((previous, formData) => {
    // «بدّل النمرة» is a submit like any other, named by its own button. A React action may not RETURN a
    // new state from `formAction`, so the intent travels in the form data and the step is decided here —
    // which keeps one form, one state and no client-side copy of the number to fall out of step.
    if (formData.get("intent") === "restart") return Promise.resolve(LOGIN_INITIAL);
    return previous.step === "phone" ? requestCode(previous, formData) : submitCode(previous, formData);
  }, LOGIN_INITIAL);

  const onCode = state.step === "code";

  return (
    <form action={action} className="space-y-5">
      {/* ONLY ON THE CODE STEP, and that `onCode &&` is load-bearing.
          It carries the number across so the second half does not have to ask for it again. But on the
          FIRST step the visible field is also `name="phone"`, and two inputs of one name put two values in
          the FormData — `formData.get("phone")` returns the FIRST, which is this one, which is empty. The
          form then posted "" however carefully the client typed their number, and the action answered «النمرة
          موش مكتوبة كيما يلزم» to a perfectly good number. */}
      {onCode ? <input type="hidden" name="phone" value={state.phone} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      {state.note ? (
        <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-forest">{state.note}</p>
      ) : null}

      {onCode ? (
        <div>
          <label htmlFor="code" className="label">
            الرمز اللي وصلك
          </label>
          <input
            id="code"
            name="code"
            type="text"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            placeholder="------"
            className="field text-center text-2xl font-bold tracking-[0.4em]"
          />
          <p className="mt-2 text-caption text-muted">
            وصل لـ <span dir="ltr">{state.phone}</span>. صالح{" "}
            {Math.max(Math.round(state.ttlSeconds / 60), 1)} دقايق.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="phone" className="label">
            نمرة التلفون
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            required
            autoFocus
            placeholder="98 124 111"
            className="field text-left"
          />
          <p className="mt-2 text-caption text-muted">نفس النمرة اللي سجّلت بيها عند AgriZed.</p>
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full min-h-13">
        {pending ? "ثنيّة…" : onCode ? "دخول" : "ابعثلي الرمز"}
      </button>

      {onCode ? (
        // A buyer who mistyped their number must not be stuck waiting for an SMS that can never arrive.
        <button type="submit" name="intent" value="restart" className="btn btn-secondary w-full border-line">
          بدّل النمرة
        </button>
      ) : null}

      {helpPhone ? (
        <p className="pt-1 text-center text-caption leading-7 text-muted">
          ما نجّمتش تدخل؟ كلّمنا على{" "}
          <a href={`tel:${helpPhone}`} dir="ltr" className="font-semibold text-forest underline-offset-4 hover:underline">
            {helpPhone}
          </a>
        </p>
      ) : null}
    </form>
  );
}
