import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import type { HeaderLink } from "@/components/site/header-bar";
import { formatPhone } from "@/lib/phone";

type SiteFooterProps = {
  legalNotice: string;
  taglineAr: string;
  taglineFr: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** Pages open to the public, the same list as the site bar. */
  links: HeaderLink[];
  /** Authors of the CC BY photographs on the site; the licence requires naming them. */
  credits?: { text: string; url: string | null }[];
};

export function SiteFooter({ legalNotice, taglineAr, taglineFr, phone, whatsapp, email, links, credits = [] }: SiteFooterProps) {
  const hasContact = Boolean(phone || whatsapp || email);

  return (
    <footer className="bg-forest-800 text-white/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="space-y-4">
          <Wordmark onDark className="text-[2.1rem]" />
          {taglineAr ? <p className="font-medium text-white/90">{taglineAr}</p> : null}
          {taglineFr ? (
            <p lang="fr" dir="ltr" className="text-right text-xs uppercase tracking-[0.22em] text-gold-bright/90">
              {taglineFr}
            </p>
          ) : null}
          <p className="max-w-md text-sm leading-7 text-white/60">{legalNotice}</p>
        </div>

        {links.length > 0 ? (
          <nav aria-label="روابط الموقع">
            <h2 className="text-sm font-semibold text-white">الموقع</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-gold-bright">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {hasContact ? (
          <div className="text-sm">
            <h2 className="font-semibold text-white">تواصل معنا</h2>
            <ul className="mt-4 space-y-2.5">
              {phone ? (
                <li>
                  الهاتف:{" "}
                  <a href={`tel:${phone}`} dir="ltr" className="font-medium text-gold-bright">
                    {formatPhone(phone)}
                  </a>
                </li>
              ) : null}
              {whatsapp ? (
                <li>
                  WhatsApp:{" "}
                  <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} dir="ltr" className="font-medium text-gold-bright">
                    {formatPhone(whatsapp)}
                  </a>
                </li>
              ) : null}
              {email ? (
                <li>
                  البريد:{" "}
                  <a href={`mailto:${email}`} dir="ltr" className="font-medium text-gold-bright">
                    {email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-5 text-xs text-white/55 sm:px-6 lg:px-8">
          <p>
            © AgriZed ·{" "}
            <Link href="/admin/login" className="underline-offset-4 hover:text-white hover:underline">
              دخول الفريق
            </Link>
          </p>
          {credits.length > 0 ? (
            <p className="leading-5">
              الصور:{" "}
              {credits.map((credit, index) => (
                <span key={credit.text}>
                  {index > 0 ? " · " : null}
                  {credit.url ? (
                    <a href={credit.url} dir="ltr" rel="noopener" className="underline-offset-2 hover:text-white hover:underline">
                      {credit.text}
                    </a>
                  ) : (
                    <span dir="ltr">{credit.text}</span>
                  )}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
