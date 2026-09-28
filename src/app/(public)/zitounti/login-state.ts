/**
 * The sign-in form's state, in a module of its own.
 *
 * WHY IT IS NOT IN actions.ts, which is where it started: a `"use server"` file may export ONLY async
 * functions. Every other export is turned into a server reference, so `export const LOGIN_INITIAL = {…}`
 * compiles, typechecks and passes the build — and then throws at runtime the first time the form is
 * submitted, with «A "use server" file can only export async functions». Neither `tsc` nor `next build`
 * catches it, which is why it is worth a comment rather than a quiet move.
 *
 * The type could have stayed there (types are erased), but keeping the shape and its initial value in one
 * place is the reason this file exists at all.
 */

/**
 * The five screens of the door, and how one leads to the next:
 *
 *   password      the default — phone + password + «تذكّر هذا الجهاز». Its two side doors:
 *                 «أوّل مرّة؟ ادخل برمز SMS» sends a login code for the number typed → otp;
 *                 «نسيت كلمة السرّ؟» → forgot_phone.
 *   otp           the code that went to the number. Right code → a session; and if the buyer has no password
 *                 yet → set_password, else the account.
 *   set_password  signed in, no password chosen: two fields, must match, min length from SQL. Then the account.
 *   forgot_phone  the number to send a reset code to.
 *   forgot_code   the reset code AND the new password, in one form — the code is burned by its check, so the
 *                 password must be collected before the check runs, not after.
 */
export type LoginStep = "password" | "otp" | "set_password" | "forgot_phone" | "forgot_code";

export type LoginState = {
  step: LoginStep;
  phone: string;
  error: string | null;
  note: string | null;
  ttlSeconds: number;
  /**
   * The owner's minimum password length, read from SQL by the action that opened a password step and carried
   * here so the field can say it. Zero until a password step is reached; the action re-reads it before it
   * accepts anything, so this copy is for the screen and never the check.
   */
  minLength: number;
};

export const LOGIN_INITIAL: LoginState = {
  step: "password",
  phone: "",
  error: null,
  note: null,
  ttlSeconds: 300,
  minLength: 0,
};
