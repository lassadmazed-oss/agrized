"use client";

import { useActionState, type ReactNode } from "react";

import { ErrorAlert } from "@/components/site/error-alert";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatPhoneFor } from "@/lib/phone";

import { changePassword, changePhone, signOutOtherDevices } from "./security-actions";
import {
  PHONE_CHANGE_INITIAL,
  SECURITY_INITIAL,
  type PhoneChangeState,
  type SecurityFormState,
} from "./security-state";

/*
 * The three forms of the security page. Each has its OWN action, its OWN state and its OWN input names:
 * three forms on one page that shared a name would post the first field's value for all of them
 * (FormData.get returns the first), and a shared state would print one form's error over another.
 *
 * Passwords are `autoComplete="current-password"` / `"new-password"` so a phone's password manager offers
 * the right thing and stores the new one. The number is `inputMode="tel"` and `dir="ltr"`; the code is
 * `autoComplete="one-time-code"` so iOS and Android can lift it straight out of the SMS.
 *
 * EVERY FORM HANDS useActionState A SERVER ACTION ITSELF, never a closure built here: a closure cannot be
 * serialised into the form, so with JavaScript off the form would post nothing. The change-phone form's two
 * steps and its restart are decided by ONE action (changePhone) from the state's step and the button's
 * `phone_intent`, the way the door's form does it.
 *
 * THE WORDS ARE THE OWNER'S, under ui.security.*, in the page's language: page.tsx wraps these forms in
 * <Texts prefixes={["ui.security."]}>. The sentences the actions answer arrive already written.
 */

/**
 * A sentence with a phone number set into it, drawn left to right wherever the language puts the placeholder:
 * the message is formatted with this marker in the placeholder's place and cut there.
 */
const SLOT = "\u0000";

function withPhone(text: string, phone: string, locale: string): ReactNode[] {
  return text.split(SLOT).flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span key={index} dir="ltr">
            {phone.startsWith("+") ? formatPhoneFor(phone, locale) : phone}
          </span>,
          part,
        ],
  );
}

function Alert({ error, done, pending = false }: { error: string | null; done: string | null; pending?: boolean }) {
  // The refusal takes the screen to itself (ErrorAlert); «تمّ» is good news and stays where it is.
  if (error) return <ErrorAlert error={error} pending={pending} />;
  if (done) {
    return <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-forest">{done}</p>;
  }
  return null;
}

/**
 * بدّل كلمة السرّ: the current one, then the new one twice.
 *
 * `disabledReason` is the sentence to print when the owner's password policy could not be read: the form is
 * then drawn but refused, because a minimum length nobody set is not a rule to enforce on a client.
 */
export function ChangePasswordForm({ minLength, disabledReason }: { minLength: number; disabledReason: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState<SecurityFormState, FormData>(changePassword, SECURITY_INITIAL);
  const disabled = pending || disabledReason !== null;

  return (
    <form action={action} className="space-y-5">
      <Alert error={disabledReason ?? state.error} done={disabledReason ? null : state.done} pending={pending} />

      <div>
        <label htmlFor="current_password" className="label">
          {t("ui.security.current_password_label")}
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          disabled={disabledReason !== null}
          className="field text-left"
        />
      </div>

      <div>
        <label htmlFor="new_password" className="label">
          {t("ui.security.new_password_label")}
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={minLength > 0 ? minLength : undefined}
          required
          disabled={disabledReason !== null}
          className="field text-left"
        />
        {minLength > 0 ? (
          <p className="mt-2 text-caption text-muted">{t("ui.security.min_length_hint", { count: minLength })}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="new_password_again" className="label">
          {t("ui.security.new_password_again_label")}
        </label>
        <input
          id="new_password_again"
          name="new_password_again"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={minLength > 0 ? minLength : undefined}
          required
          disabled={disabledReason !== null}
          className="field text-left"
        />
      </div>

      <button type="submit" disabled={disabled} className="btn btn-primary w-full min-h-13">
        {pending ? t("ui.security.pending") : t("ui.security.change_password_submit")}
      </button>
    </form>
  );
}

/**
 * بدّل النمرة: the new number and the buyer's password, then the code that went to the new number. One form,
 * one server action; the step decides which half is drawn and the action decides which act runs.
 *
 * THE PASSWORD IS ASKED ON THE NUMBER STEP, not just the session: a remembered device is a session somebody
 * else may be holding, and moving the number is the first half of taking the account (the reset code goes
 * to the number on file). Its input has a name of its own — three forms share this page, and FormData.get
 * returns the first field of a name.
 */
export function ChangePhoneForm({ currentPhone }: { currentPhone: string | null }) {
  const t = useT();
  const locale = useLocale();
  const [state, action, pending] = useActionState<PhoneChangeState, FormData>(changePhone, PHONE_CHANGE_INITIAL);

  const onCode = state.step === "code";

  return (
    <form action={action} className="space-y-5">
      {/* Only on the code step: on the first step the visible field is `new_phone` too, and two inputs of
          one name would make FormData.get return this empty one. */}
      {onCode ? <input type="hidden" name="new_phone" value={state.newPhone} /> : null}

      <Alert error={state.error} done={state.done} pending={pending} />
      {state.note ? (
        <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-forest">{state.note}</p>
      ) : null}

      {onCode ? (
        <div>
          <label htmlFor="phone_code" className="label">
            {t("ui.security.phone_code_label")}
          </label>
          <input
            id="phone_code"
            name="phone_code"
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
            {withPhone(
              t("ui.security.phone_code_sent_to", {
                phone: SLOT,
                minutes: Math.max(Math.round(state.ttlSeconds / 60), 1),
              }),
              state.newPhone,
              locale,
            )}
          </p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="new_phone" className="label">
              {t("ui.security.new_phone_label")}
            </label>
            <input
              id="new_phone"
              name="new_phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="98 124 111"
              defaultValue={state.newPhone}
              className="field text-left"
            />
            {currentPhone ? (
              <p className="mt-2 text-caption text-muted">
                {withPhone(t("ui.security.current_phone_note", { phone: SLOT }), currentPhone, locale)}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="phone_current_password" className="label">
              {t("ui.security.phone_password_label")}
            </label>
            <input
              id="phone_current_password"
              name="phone_current_password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              className="field text-left"
            />
            <p className="mt-2 text-caption text-muted">{t("ui.security.phone_password_hint")}</p>
          </div>
        </>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full min-h-13">
        {pending
          ? t("ui.security.pending")
          : t(onCode ? "ui.security.confirm_phone_submit" : "ui.security.send_code_submit")}
      </button>

      {onCode ? (
        // `formNoValidate` because the code field is required for the main button and must not block a buyer
        // who wants to change the number they typed.
        <button type="submit" name="phone_intent" value="restart" formNoValidate className="btn btn-secondary w-full border-line">
          {t("ui.security.change_number")}
        </button>
      ) : null}
    </form>
  );
}

/** اخرج من الأجهزة الأخرى: one button, every other session of this account is revoked. */
export function SignOutOthersForm({ label }: { label: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<SecurityFormState, FormData>(
    signOutOtherDevices,
    SECURITY_INITIAL,
  );

  return (
    <form action={action} className="space-y-4">
      <Alert error={state.error} done={state.done} pending={pending} />
      <button type="submit" disabled={pending} className="btn btn-secondary w-full border-line">
        {pending ? t("ui.security.pending") : label}
      </button>
    </form>
  );
}
