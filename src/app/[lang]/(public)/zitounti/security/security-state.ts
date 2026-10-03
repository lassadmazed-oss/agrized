/**
 * The three forms of /zitounti/security, each with a state of its own, in a plain module.
 *
 * WHY NOT IN security-actions.ts: a `"use server"` file may export ONLY async functions. A constant exported
 * from one compiles, typechecks, builds — and throws the first time a form is submitted («A "use server"
 * file can only export async functions»). login-state.ts next door exists for the same reason; this file is
 * its twin for the security page.
 *
 * THREE STATES AND NOT ONE, because three forms sit on one page and each is submitted on its own. A shared
 * state would print the password form's error above the phone form, and a success in one would blank the
 * other's half-typed number.
 */

/** A form that either did the thing or says why not. `done` is the sentence to print when it did. */
export type SecurityFormState = {
  error: string | null;
  done: string | null;
};

export const SECURITY_INITIAL: SecurityFormState = { error: null, done: null };

/**
 * Changing the number is two steps, like the login: the new number, then the code that went to it.
 * `newPhone` is carried in the state (and echoed as a hidden field) so the confirm step needs no second
 * copy of it on the client.
 */
export type PhoneChangeState = {
  step: "phone" | "code";
  newPhone: string;
  error: string | null;
  note: string | null;
  done: string | null;
  ttlSeconds: number;
};

export const PHONE_CHANGE_INITIAL: PhoneChangeState = {
  step: "phone",
  newPhone: "",
  error: null,
  note: null,
  done: null,
  ttlSeconds: 300,
};
