"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, { error: null, email: "" });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="label">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="field text-left"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          كلمة السر
        </label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required className="field text-left" />
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
