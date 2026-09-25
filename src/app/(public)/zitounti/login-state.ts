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
export type LoginState = {
  /** Which half of the form to draw: the number, or the code. */
  step: "phone" | "code";
  phone: string;
  error: string | null;
  note: string | null;
  ttlSeconds: number;
};

export const LOGIN_INITIAL: LoginState = { step: "phone", phone: "", error: null, note: null, ttlSeconds: 300 };
