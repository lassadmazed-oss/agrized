"use client";

import { useActionState, type ReactNode } from "react";

import { ErrorAlert } from "@/components/site/error-alert";
import { CallChooser } from "@/components/site/call-chooser";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatPhoneFor } from "@/lib/phone";

import { requestCode, requestResetCode, resetPassword, setPassword, signInPassword, signOut, submitCode } from "./actions";
import { LOGIN_INITIAL, type LoginState } from "./login-state";

/*
 * The buyer's sign-in: phone + password by default, a code by SMS the first time, and a code again only when
 * a password is forgotten.
 *
 * ONE FORM, ONE STATE, AND THE STEP DECIDES WHICH FIELDS ARE DRAWN. Splitting it into five components would
 * mean holding the phone number in a sixth place and keeping it in step; here the server action returns the
 * whole state — including which screen to draw — so there is exactly one source of truth and a refresh cannot
 * desync it. login-state.ts names the steps and how each leads to the next.
 *
 * THE NUMBER IS `inputMode="tel"` AND `dir="ltr"`, because a phone number is Latin digits read left to right
 * even on a right-to-left page, and a phone keyboard is what a buyer should get on a phone. The code is
 * `inputMode="numeric"` with `autoComplete="one-time-code"`, which is what lets iOS and Android offer the code
 * straight from the SMS notification. Password fields carry `current-password` or `new-password` so a phone's
 * password manager offers to save the one just chosen and fills the one already saved.
 *
 * ONE INPUT NAME PER FORM. The hidden phone that carries the number across the code steps is drawn ONLY when
 * no visible phone field is — `FormData.get` returns the first of two same-named inputs, and an empty hidden
 * one in front of the typed one is how this form once posted "" for a perfectly good number.
 *
 * THE WORDS ARE THE OWNER'S, under ui.login.*, in the page's language: the page wraps this form in
 * <Texts prefixes={["ui.login."]}>. The sentences the actions answer arrive already written.
 */

const FIELD_NOTE = "mt-2 text-caption text-muted";

/**
 * A sentence with one element set into it — a number drawn left to right, a link — wherever the language puts
 * its placeholder. The message is formatted with this marker in the placeholder's place and cut there, so no
 * language is held to the Arabic word order and the element keeps its own `dir`.
 */
const SLOT = "\u0000";

function withSlot(text: string, slot: (key: number) => ReactNode): ReactNode[] {
  return text.split(SLOT).flatMap((part, index) => (index === 0 ? [part] : [slot(index), part]));
}

export function ClientLoginForm({
  helpPhone,
  initialState = LOGIN_INITIAL,
}: {
  helpPhone: string | null;
  /** page.tsx starts the form at `set_password` for a signed-in buyer who has not chosen one yet. */
  initialState?: LoginState;
}) {
  const t = useT();
  const locale = useLocale();
  const [state, action, pending] = useActionState<LoginState, FormData>((previous, formData) => {
    // Side doors are submits like any other, named by their own button. A React action may not RETURN a new
    // state from `formAction`, so the intent travels in the form data and the step is decided here — which
    // keeps one form, one state and no client-side copy of the number to fall out of step.
    const intent = formData.get("intent");
    if (intent === "restart") return Promise.resolve(LOGIN_INITIAL);
    if (intent === "forgot") {
      // A client-side move: nothing is sent until the buyer confirms the number on the next screen. The number
      // typed so far comes along as a prefill, untouched — the action normalises it when it is submitted.
      return Promise.resolve({ ...LOGIN_INITIAL, step: "forgot_phone" as const, phone: String(formData.get("phone") ?? "") });
    }
    if (intent === "otp") return requestCode(previous, formData);
    // «اطلب رمز جديد» on a code step: the same request again, with the number the hidden field carries — the
    // error sentences tell the buyer to do exactly this, so there has to be a button that does it.
    if (intent === "resend") {
      return previous.step === "forgot_code" ? requestResetCode(previous, formData) : requestCode(previous, formData);
    }

    switch (previous.step) {
      case "password":
        return signInPassword(previous, formData);
      case "otp":
        return submitCode(previous, formData);
      case "set_password":
        return setPassword(previous, formData);
      case "forgot_phone":
        return requestResetCode(previous, formData);
      case "forgot_code":
        return resetPassword(previous, formData);
    }
  }, initialState);

  const step = state.step;
  const carriesPhone = step === "otp" || step === "forgot_code";
  const asksPassword = step === "set_password" || step === "forgot_code";
  const minutes = Math.max(Math.round(state.ttlSeconds / 60), 1);

  return (
    <>
      <form action={action} className="space-y-5">
        {carriesPhone ? <input type="hidden" name="phone" value={state.phone} /> : null}

        <ErrorAlert error={state.error} pending={pending} />
        {state.note ? (
          <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-forest">{state.note}</p>
        ) : null}

        {/* ---- the number: typed on the password screen and on the forgot screen ---- */}
        {step === "password" || step === "forgot_phone" ? (
          <div>
            <label htmlFor="phone" className="label">
              {t("ui.login.phone_label")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              autoFocus={step === "password"}
              defaultValue={state.phone}
              placeholder="98 124 111"
              className="field text-left"
            />
            <p className={FIELD_NOTE}>{t("ui.login.phone_hint")}</p>
          </div>
        ) : null}

        {/* ---- the password, on the default screen ---- */}
        {step === "password" ? (
          <>
            <div>
              <label htmlFor="password" className="label">
                {t("ui.login.password_label")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                className="field text-left"
              />
            </div>
            <RememberDevice />
          </>
        ) : null}

        {/* ---- the code, for a first sign-in and for a reset ---- */}
        {step === "otp" || step === "forgot_code" ? (
          <div>
            <label htmlFor="code" className="label">
              {t("ui.login.code_label")}
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
            <p className={FIELD_NOTE}>
              {withSlot(t("ui.login.code_sent_to", { phone: SLOT, minutes }), (key) => (
                <span key={key} dir="ltr">
                  {state.phone}
                </span>
              ))}
            </p>
          </div>
        ) : null}

        {/* ---- a new password, twice: the first time, and after a reset ---- */}
        {asksPassword ? (
          <>
            {step === "set_password" ? (
              <p className="text-sm leading-7 text-ink">{t("ui.login.set_password_intro")}</p>
            ) : null}
            <div>
              <label htmlFor="new_password" className="label">
                {t(step === "forgot_code" ? "ui.login.new_password_label" : "ui.login.password_label")}
              </label>
              <input
                id="new_password"
                name="new_password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={state.minLength > 0 ? state.minLength : undefined}
                autoFocus={step === "set_password"}
                className="field text-left"
              />
              {state.minLength > 0 ? (
                <p className={FIELD_NOTE}>{t("ui.login.min_length_hint", { count: state.minLength })}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="confirm_password" className="label">
                {t("ui.login.confirm_password_label")}
              </label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={state.minLength > 0 ? state.minLength : undefined}
                className="field text-left"
              />
            </div>
            {/* On set_password too: the first-time buyer is about to be signed in with the password they just
                chose, and whether that session outlives the window is their call, same as on every other
                door. One input named «remember», drawn on one step at a time. */}
            {step === "forgot_code" || step === "set_password" ? <RememberDevice /> : null}
          </>
        ) : null}

        <button type="submit" disabled={pending} className="btn btn-primary w-full min-h-13">
          {pending ? t("ui.login.pending") : t(SUBMIT_LABEL[step])}
        </button>

        {step === "password" ? (
          <div className="flex flex-col gap-2">
            {/* Both are side doors out of the password screen. `formNoValidate` because the password field is
                required for the main button and must not block a buyer who has no password to type yet. */}
            <button type="submit" name="intent" value="otp" formNoValidate disabled={pending} className="btn btn-secondary w-full border-line">
              {t("ui.login.first_time_sms")}
            </button>
            <button type="submit" name="intent" value="forgot" formNoValidate className="mx-auto py-2 text-sm font-semibold text-forest underline-offset-4 hover:underline">
              {t("ui.login.forgot_password")}
            </button>
          </div>
        ) : null}

        {step === "otp" || step === "forgot_code" ? (
          <div className="flex flex-col gap-2">
            {/* `formNoValidate` on both: the code field is required for the main button and must not block a
                buyer who has no code to type. */}
            <button type="submit" name="intent" value="resend" formNoValidate disabled={pending} className="btn btn-secondary w-full border-line">
              {t("ui.login.resend_code")}
            </button>
            {/* A buyer who mistyped their number must not be stuck waiting for an SMS that can never arrive. */}
            <button type="submit" name="intent" value="restart" formNoValidate className="btn btn-secondary w-full border-line">
              {t("ui.login.change_number")}
            </button>
          </div>
        ) : null}

        {step === "forgot_phone" ? (
          <button type="submit" name="intent" value="restart" formNoValidate className="btn btn-secondary w-full border-line">
            {t("ui.login.back")}
          </button>
        ) : null}

        {helpPhone ? (
          <p className="pt-1 text-center text-caption leading-7 text-muted">
            {withSlot(t("ui.login.help_call", { phone: SLOT }), (key) => (
              // A call or WhatsApp, chosen in one panel — a `type="button"`, so it never submits this form.
              <CallChooser key={key} phone={helpPhone} className="font-semibold text-forest underline-offset-4 hover:underline">
                <span dir="ltr">{formatPhoneFor(helpPhone, locale)}</span>
              </CallChooser>
            ))}
          </p>
        ) : null}
      </form>

      {step === "set_password" ? (
        // THE WAY OUT. A signed-in buyer on the «أنشئ كلمة سرّ» step holds a session but is shown no account and
        // no sign-out — a plain form of its own (forms do not nest) so that a buyer who is not the person this
        // session belongs to, or who simply changed their mind, can leave rather than being held at the door.
        <form action={signOut} className="pt-4">
          <button type="submit" className="btn btn-secondary w-full border-line">
            {t("ui.login.sign_out")}
          </button>
        </form>
      ) : null}
    </>
  );
}

/** The main button's words on each step, as the keys of the owner's texts. */
const SUBMIT_LABEL: Record<LoginState["step"], string> = {
  password: "ui.login.submit_sign_in",
  otp: "ui.login.submit_sign_in",
  set_password: "ui.login.submit_set_password",
  forgot_phone: "ui.login.submit_send_code",
  forgot_code: "ui.login.submit_reset_password",
};

/**
 * «تذكّر هذا الجهاز». Unticked, the session ends when the browser is closed; ticked, it stays on this device.
 * The value is read by the action and decides only the cookies' lifetime — never what the buyer may see.
 */
function RememberDevice() {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
      <input type="checkbox" name="remember" value="1" className="size-5 accent-forest" />
      <span>
        {t("ui.login.remember_device")}
        <span className="block text-caption text-muted">{t("ui.login.remember_device_hint")}</span>
      </span>
    </label>
  );
}
