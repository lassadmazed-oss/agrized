/**
 * Where a reader may be sent after signing in.
 *
 * It lived in actions.ts, which is `"use server"` and may therefore export only async functions — so the
 * login PAGE could not use it, and put whatever arrived in `?next=` straight into a hidden field. The
 * server guard was always there and always held: an external URL was replaced with /admin on submit, so
 * there was no open redirect. But an external review (2026-10-25, F03) saw `example.com` reflected into the
 * form and had to spend a paragraph deciding whether it was one, which is a paragraph nobody should have to
 * write. The page uses this now too, so a foreign address never reaches the HTML at all.
 *
 * THE RULE: an absolute path inside the Back Office, and nothing else. A value starting with «//» is a
 * protocol-relative URL — «//evil.example» is another site, not a path — and /admin/login is excluded so a
 * successful sign-in cannot land back on the sign-in screen.
 */
export function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") && !next.startsWith("//") && !next.startsWith("/admin/login") ? next : "/admin";
}
