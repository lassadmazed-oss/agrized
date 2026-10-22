"use client";

import Link from "next/link";

import { useLocaleHref, useT } from "@/lib/i18n/client";

/*
 * «افتح حسابك» — offered on the screen that says «تمّ», to a reader who does not already have an account.
 *
 * The owner chose this over making the account for him (2026-10-22, answer «2»): an account made
 * automatically means an SMS to everyone who fills a form, out of the same budget he is trying to cut and to
 * people who did not ask for one. NOTHING IS SENT BY THIS COMPONENT. It is a sentence and a link; the link
 * lands on فضاء «زيتونتي» with his number already in the field, and the SMS goes out only when he presses
 * «أوّل مرّة؟ ادخل برمز SMS» there — 0096's own door, not a second one beside it.
 *
 * It is shown only when readIntakePrefill() came back null. A buyer who is signed in has the account already,
 * and has seen «عمّرنا معلوماتك» one screen earlier.
 *
 * The copy is in settings (ui.account_invite.*, 0149); the page that renders this ships that prefix.
 */
export function AccountInvite({ phone }: { phone: string }) {
  const t = useT();
  const href = useLocaleHref();

  // The number travels as the buyer typed it. The sign-in field takes the same shape, and normalising it
  // here would mean a second place that decides what a Tunisian number looks like.
  const typed = phone.trim();
  const target = typed ? `/zitounti?phone=${encodeURIComponent(typed)}` : "/zitounti";

  return (
    <div className="mt-6 rounded-2xl border border-forest/15 bg-forest/5 p-5 text-start">
      <p className="font-display text-lg font-bold text-forest">{t("ui.account_invite.title")}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{t("ui.account_invite.text")}</p>
      <Link
        href={href(target)}
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-paper hover:bg-forest-700"
      >
        {t("ui.account_invite.cta")}
      </Link>
    </div>
  );
}
