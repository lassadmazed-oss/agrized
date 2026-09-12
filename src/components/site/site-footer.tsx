import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { formatPhone } from "@/lib/phone";

type SiteFooterProps = {
  legalNotice: string;
  taglineFr: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** Authors of the CC BY photographs on the site; the licence requires naming them. */
  credits?: { text: string; url: string | null }[];
};

export function SiteFooter({ legalNotice, taglineFr, phone, whatsapp, email, credits = [] }: SiteFooterProps) {
  const hasContact = Boolean(phone || whatsapp || email);

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <Wordmark className="text-2xl" />
          {taglineFr ? (
            <p dir="ltr" className="text-end text-xs uppercase tracking-[0.2em] text-muted md:text-start">
              {taglineFr}
            </p>
          ) : null}
          <p className="max-w-prose text-sm leading-7 text-muted">{legalNotice}</p>
        </div>

        <div className="space-y-3 text-sm">
          {hasContact ? (
            <>
              <h2 className="font-semibold text-ink">تواصل معنا</h2>
              <ul className="space-y-2 text-muted">
                {phone ? (
                  <li>
                    الهاتف:{" "}
                    <a href={`tel:${phone}`} dir="ltr" className="font-medium text-forest">
                      {formatPhone(phone)}
                    </a>
                  </li>
                ) : null}
                {whatsapp ? (
                  <li>
                    WhatsApp:{" "}
                    <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} dir="ltr" className="font-medium text-forest">
                      {formatPhone(whatsapp)}
                    </a>
                  </li>
                ) : null}
                {email ? (
                  <li>
                    البريد:{" "}
                    <a href={`mailto:${email}`} dir="ltr" className="font-medium text-forest">
                      {email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}
          {credits.length > 0 ? (
            <p className="text-xs leading-5 text-muted">
              الصور:{" "}
              {credits.map((credit, index) => (
                <span key={credit.text}>
                  {index > 0 ? " · " : null}
                  {credit.url ? (
                    <a href={credit.url} dir="ltr" rel="noopener" className="underline-offset-2 hover:underline">
                      {credit.text}
                    </a>
                  ) : (
                    <span dir="ltr">{credit.text}</span>
                  )}
                </span>
              ))}
            </p>
          ) : null}
          <p className="pt-2 text-xs text-muted">
            © AgriZed ·{" "}
            <Link href="/admin/login" className="underline-offset-4 hover:underline">
              دخول الفريق
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
