"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutFromForm } from "@/app/[lang]/(public)/account-actions";
import { useLocaleHref, useT } from "@/lib/i18n/client";

/*
 * The two lines a request form shows about the account behind it.
 *
 * The owner, 2026-10-22: a buyer may send a request with no account — that does not change — but one who has
 * an account should send from it and «ما يقعدش كل مرّة يعمّر». These are the only visible part of that: one
 * box for a reader we recognise, one quiet line for a reader we do not.
 *
 * NEITHER OF THEM BLOCKS ANYTHING. The invitation below is a sentence and a link, never a step, never a
 * dialog, never a field that must be answered first. A form that stops to ask a buyer to sign in is a form
 * that loses the buyers who will not.
 *
 * The copy is in settings (ui.prefill.*, 0147) in the five languages, and the page that renders this must
 * ship that prefix through <Texts>.
 */

/** For a reader whose details we already filled in. */
export function PrefillNote({ name, returning }: { name: string | null; returning: boolean }) {
  const t = useT();
  const pathname = usePathname();

  return (
    <div className="rounded-2xl border border-forest/15 bg-forest/5 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-forest">{t("ui.prefill.title")}</p>
        {/* The sign-out posts the path it was pressed on, so the form it leaves behind is not served from
            the cache with the previous buyer's name still in it. */}
        <form action={signOutFromForm}>
          <input type="hidden" name="path" value={pathname} />
          <button type="submit" className="text-xs font-medium text-muted underline underline-offset-4 hover:text-ink">
            {t("ui.prefill.not_you")}
          </button>
        </form>
      </div>
      {name ? <p className="mt-1 font-semibold text-ink">{name}</p> : null}
      <p className="mt-1 text-muted">{t("ui.prefill.text")}</p>
      {/* Only once there is something to be «alongside»: a first request has no earlier ones. */}
      {returning ? <p className="mt-1 text-muted">{t("ui.prefill.offer")}</p> : null}
    </div>
  );
}

/** For a reader we do not recognise. One sentence, one link, nothing in the way. */
export function SignInHint() {
  const t = useT();
  const href = useLocaleHref();

  return (
    <p className="text-sm text-muted">
      {t("ui.prefill.sign_in")}{" "}
      <Link href={href("/zitounti")} className="font-medium text-forest underline underline-offset-4">
        {t("ui.prefill.sign_in_cta")}
      </Link>
    </p>
  );
}
