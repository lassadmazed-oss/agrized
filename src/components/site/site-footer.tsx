import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { siteNav } from "@/components/site/site-header";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, settingJson, settingText } from "@/lib/config";
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

/** A link the owner adds once the page behind it exists. Nothing is seeded, so nothing is printed today. */
type LegalLink = { label: string; href: string };

/**
 * The end of every page. Until 2026-09-19 its only link was the staff door, so a visitor who scrolled to the
 * bottom of the catalogue had no way back into the site: the footer prints the same table of contents as the
 * header (siteNav), which is the site's own map and names each destination with the setting that titles it.
 * It reads the configuration itself, like <SiteHeader>, so the layout passes it no new props.
 *
 * 2026-09-21, reference image 2: it becomes a dark band over a photograph — four columns from the inline
 * start (the wordmark, the quick links, the contact details, and the closing line set large in gold), then a
 * thin bar of small print. Three things worth knowing before changing it again:
 *
 *  · THIS BAND IS ON EVERY PUBLIC PAGE, not only the home page: /projects, /start, /register, /land and the
 *    coverage map all end here. Making it dark was a decision about the whole site, taken knowingly.
 *  · THE PHOTOGRAPH IS `home.land`, and only while the landowner module is closed. Every other slot already
 *    has a section of its own on the home page — home.hero the banner, home.coverage the counter,
 *    home.journey the area grid, home.closing the last ask — and a band that repeats one of them shows the
 *    same picture twice in one screen. When `land_offers` opens, home.land belongs to its section and this
 *    band falls back to flat forest: the composition is identical, which makes the fallback a decision
 *    rather than a hole.
 *  · THE REFERENCE'S «سياسة الخصوصية · شروط الاستخدام» and its four social marks are NOT drawn here. No such
 *    routes exist under src/app/(public) and no setting holds a social address, and a footer link that
 *    resolves to nothing is worse than a footer without it. `site.legal_links` is read so the owner can add
 *    them the day the pages exist; it is empty, so the bar prints the copyright and the staff door alone.
 *
 * 2026-09-19: the photo credits stopped being a <details> — see <PhotoCredits> at the foot of this file for
 * why a disclosure was the wrong shape for an attribution, and where the names went instead.
 */
export async function SiteFooter({ legalNotice, taglineFr, phone, whatsapp, email, credits = [] }: SiteFooterProps) {
  const config = await getPublicConfig();
  /*
   * THE FOLLOW-UP DOOR, and why it is added HERE rather than in siteNav().
   *
   * «وين وصل مطلبي؟» (/track) is where somebody who already sent a demand reads back the number the intake
   * gave them. It belongs at the bottom of the page and not in the header bar: the bar is where a visitor is
   * offered something — the catalogue, the simulator, an account — and this is where a visitor who has
   * already accepted comes back to ask what happened. That is the footer's job, which is also why the staff
   * door and the legal small print live down here and nowhere else.
   *
   * It is NOT gated on `interest_form`. That flag decides whether a NEW demand may be sent; the demands
   * already in the table keep their reference numbers, and the day the intake closes for the season every one
   * of those numbers must still open something. /track itself makes the same argument at the top of its page.
   *
   * The word is the owner's, from `site.nav_track_label` — emptying that setting removes the link, the same
   * contract every other sentence in this footer has.
   */
  const trackLabel = settingText(config, "site.nav_track_label", "وين وصل مطلبي؟");
  const links = [...siteNav(config), ...(trackLabel ? [{ href: "/track", label: trackLabel }] : [])];
  // The word that introduces the photographers. It was written into the markup; it is a setting like every
  // other sentence on the site now, so emptying it prints the names alone and the owner never edits code.
  const creditsLabel = settingText(config, "site.photo_credits_label", "مصادر الصور");
  // Four headings and two labels that used to be strings in this file. They have no seeded row yet, so they
  // carry the fallback the site already showed — the same shape as site.how_title and site.land_title.
  const navTitle = settingText(config, "site.nav_title", "روابط سريعة");
  const contactTitle = settingText(config, "site.contact_title", "تواصل معنا");
  const staffLabel = settingText(config, "site.staff_door_label", "دخول الفريق");
  const copyright = settingText(config, "site.copyright_label", "© AgriZed");
  // «تونس، صفاقس» in the drawing. A place is a fact about the company, so it has no fallback: no setting,
  // no line.
  const address = settingText(config, "site.contact_address");
  // The closing line the home page used to print over its own photograph, a wordmark and 140px above a
  // second wordmark. It says the same thing under any page, so it ends the site instead of ending one page.
  const closingLine = settingText(config, "site.closing_title", settingText(config, "site.vision_title"));
  const legalLinks = settingJson<LegalLink[]>(config, "site.legal_links", []).filter(
    (link) => link && link.label && link.href,
  );

  const hasContact = Boolean(phone || whatsapp || email || address);
  const whatsappDigits = whatsapp.replace(/\D/g, "");
  // See the note above: the photograph is this slot's only home while the landowner section is not on the page.
  const showPhoto = flagState(config, "land_offers") !== "public";

  return (
    <footer className="relative isolate hidden overflow-hidden bg-forest-700 text-paper md:block">
      {showPhoto ? (
        // The picture holds the END half and dissolves into flat green before it reaches the words. The
        // gradient axis is written physically because this document is `dir="rtl"` at the root
        // (src/app/layout.tsx) and is never anything else: «to the right» is «toward the inline start».
        <div aria-hidden="true" className="absolute inset-y-0 end-0 hidden w-full md:block lg:w-[58%]">
          <SitePhoto config={config} slot="home.land" fill sizes="(min-width: 1024px) 58vw, 100vw" />
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-forest-700/70 to-forest-700" />
        </div>
      ) : null}
      {/* One even darkening over everything, so the type keeps the same contrast whichever photograph the
          owner uploads next — the legibility never depends on the picture being dark. */}
      <div aria-hidden="true" className="absolute inset-0 hidden bg-forest-700/80 md:block" />

      {/* THE PHONE'S FOOTER (owner, 2026-09-22: «takes too much space and yeah bad»). The four-column footer
          below stacks into a single column on a phone: wordmark, French tagline, the legal notice, a heading
          and six links, a heading and three contact rows, then a 3xl closing line — about 750px of dark band
          under a screen that is itself 830px. A footer is the end of a page, not a second page. So on a phone
          it is one block: who this is, the one sentence the law needs, and the two ways to reach a human.
          The full one is unchanged from `md` up. */}
      <div className="relative px-4 py-6 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="AgriZed، الصفحة الرئيسية">
            <Wordmark onDark className="text-2xl" />
          </Link>
          {phone || whatsapp ? (
            <div className="flex gap-2">
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  aria-label={phone}
                  className="flex size-10 items-center justify-center rounded-xl bg-paper/12 text-gold-bright"
                >
                  <PhoneGlyph />
                </a>
              ) : null}
              {whatsappDigits ? (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  aria-label="WhatsApp"
                  className="flex size-10 items-center justify-center rounded-xl bg-paper/12 text-gold-bright"
                >
                  <WhatsAppGlyph />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        {legalNotice ? <p className="mt-3 text-[0.6875rem] leading-5 text-paper/65">{legalNotice}</p> : null}

        {links.length > 0 ? (
          <nav aria-label={navTitle || "أقسام الموقع"} className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="py-1 text-[0.75rem] text-paper/85">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="relative mx-auto hidden max-w-6xl px-4 py-section sm:px-6 md:block lg:py-band">
        <div className="grid gap-roomy sm:grid-cols-2 lg:grid-cols-[1.15fr_0.7fr_1fr_0.85fr] lg:gap-cozy">
          <div className="space-y-snug">
            <Link href="/" className="inline-flex items-center gap-tight rounded-md" aria-label="AgriZed، الصفحة الرئيسية">
              <LeafMark />
              <Wordmark onDark className="text-3xl" />
            </Link>
            {taglineFr ? (
              <p dir="ltr" className="text-start text-xs uppercase tracking-[0.2em] text-gold-bright/90">
                {taglineFr}
              </p>
            ) : null}
            {/* PRN-01, site-wide: «AgriZed لا تضمن أي إنتاج أو مردود مالي». It ends every page and it stays. */}
            {legalNotice ? <p className="max-w-prose text-caption leading-6 text-paper/70">{legalNotice}</p> : null}
          </div>

          {links.length > 0 ? (
            <nav aria-label={navTitle || "أقسام الموقع"}>
              {navTitle ? <h2 className="text-label font-semibold text-gold-bright">{navTitle}</h2> : null}
              {/* Two columns of 44px rows at 375, one tight column from sm up: a link in a footer is a tap
                  target on a phone and a line of a list on a desk, and it should not be the same thing twice. */}
              <ul className="mt-tight grid grid-cols-2 gap-x-cozy sm:grid-cols-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center text-caption text-paper/85 underline-offset-4 hover:text-paper hover:underline sm:min-h-0 sm:py-1"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {hasContact ? (
            <div>
              <h2 className="text-label font-semibold text-gold-bright">{contactTitle}</h2>
              <ul className="mt-tight text-caption">
                {phone ? (
                  <ContactRow href={`tel:${phone}`} icon={<PhoneGlyph />}>
                    <span dir="ltr">{formatPhone(phone)}</span>
                  </ContactRow>
                ) : null}
                {whatsappDigits ? (
                  <ContactRow href={`https://wa.me/${whatsappDigits}`} icon={<WhatsAppGlyph />}>
                    <span dir="ltr">{formatPhone(whatsapp)}</span>
                  </ContactRow>
                ) : null}
                {email ? (
                  <ContactRow href={`mailto:${email}`} icon={<MailGlyph />}>
                    <span dir="ltr">{email}</span>
                  </ContactRow>
                ) : null}
                {address ? <ContactRow icon={<PinGlyph />}>{address}</ContactRow> : null}
              </ul>
            </div>
          ) : null}

          {closingLine ? (
            // The drawing sets this in a gold handwritten script. We load Markazi and IBM Plex Arabic and no
            // script face, and a new face is a new dependency — so it is a large display line in gold and
            // does not pretend to be handwriting. The hairline beside it is the drawing's own separator.
            <p className="font-display text-3xl font-bold leading-tight text-gold-bright text-balance sm:text-4xl lg:border-s lg:border-paper/20 lg:ps-roomy">
              {closingLine}
            </p>
          ) : null}
        </div>
      </div>

      {/* The staff door used to be the most prominent link in the footer, beside the copyright, on a page built
          for clients. It keeps its place — people who need it know where to look — in a quiet strip of its own.
          The photo credits join it here: the closing strip is where a page files what it owes rather than what
          it offers, and all three lines are the same 12px, so the strip reads as one line of small print. */}
      <div className="relative border-t border-paper/12 bg-transparent md:bg-forest-700/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-cozy gap-y-tight px-4 py-2.5 text-[0.6875rem] text-paper/65 sm:px-6 sm:py-4 sm:text-xs">
          <p>{copyright}</p>
          {credits.length > 0 ? <PhotoCredits credits={credits} label={creditsLabel} /> : null}
          <div className="flex flex-wrap items-center gap-x-cozy gap-y-tight">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="underline-offset-4 hover:text-paper hover:underline">
                {link.label}
              </Link>
            ))}
            <Link href="/admin/login" className="underline-offset-4 hover:text-paper hover:underline">
              {staffLabel}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** One contact detail: a gold glyph, then the value. A 44px row on a phone, where it is something to press. */
function ContactRow({ href, icon, children }: { href?: string; icon: ReactNode; children: ReactNode }) {
  const inner = (
    <>
      <span aria-hidden="true" className="flex-none text-gold-bright">
        {icon}
      </span>
      {children}
    </>
  );

  return (
    <li>
      {href ? (
        <a
          href={href}
          rel="noopener"
          className="flex min-h-11 items-center gap-snug text-paper/85 underline-offset-4 hover:text-paper hover:underline sm:min-h-9"
        >
          {inner}
        </a>
      ) : (
        <span className="flex min-h-11 items-center gap-snug text-paper/85 sm:min-h-9">{inner}</span>
      )}
    </li>
  );
}

/**
 * The leaf of the mark, beside the wordmark. The reference draws a gold crescent under a green leaf; the
 * brand has no such asset as a component, so it is drawn here in the two brand colours, small and quiet,
 * and it is decoration — the wordmark beside it is what names the site.
 */
function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 flex-none">
      <path d="M20 4c-7.2.4-12 3.6-12 9a6 6 0 0 0 1.5 4C12.8 15.3 16 11.6 17.6 8c-1 4-4 8.2-7.2 10.6" fill="none" stroke="var(--color-leaf-soft)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 13.5c1.6 4 4.3 6 8 6.4" fill="none" stroke="var(--color-gold-bright)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 13.8v2a1.3 1.3 0 0 1-1.5 1.3 13 13 0 0 1-5.6-2 12.6 12.6 0 0 1-3.9-3.9 13 13 0 0 1-2-5.7A1.3 1.3 0 0 1 5.3 4h2a1.3 1.3 0 0 1 1.3 1.1c.1.7.3 1.3.5 1.9a1.3 1.3 0 0 1-.3 1.4l-.8.8a10.4 10.4 0 0 0 3.8 3.8l.8-.8a1.3 1.3 0 0 1 1.4-.3c.6.2 1.2.4 1.9.5a1.3 1.3 0 0 1 1.1 1.4Z" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.6 16.4 4.7 13A7 7 0 1 1 7.3 15.5l-3.7.9Z" />
      <path d="M7.8 8c.2 1.2.7 2.2 1.6 3 .8.9 1.8 1.4 3 1.6l.7-1-1.6-.8-.7.6a5 5 0 0 1-1.8-1.8l.6-.7L8.8 7.3l-1 .7Z" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="m3 6 7 4.5L17 6" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17.5s5.5-4.6 5.5-9a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.4" r="2" />
    </svg>
  );
}

/**
 * The authors of the CC BY photographs, printed.
 *
 * Until 2026-09-19 this was a <details>: `text-xs text-muted`, `list-none`, the webkit marker hidden, no
 * chevron, no plus, no underline at rest. Closed, it was a 12px grey line indistinguishable from the 12px
 * grey contact lines beside it, its only affordance was `hover:underline` — which does not exist on the
 * device most visitors use — and its tap target was about 16px tall, a third of the 3rem minimum.
 *
 * The house disclosure pattern (the FAQ on the home page: a `min-h-12` row with a gold «+» that rotates
 * open) would have fixed the affordance, and it is the right answer where the hidden content is worth a
 * gesture. It is not the right answer here. An attribution is not something a visitor goes looking for —
 * it is something the licence requires the site to state — so hiding it behind a control that must first
 * announce itself costs more room than the names do. Something worth saying belongs on the page: the
 * names are printed, once, in the strip where the small print lives, with no control at all.
 *
 * The credits are separated by the gap of a flex row, not by a « · ». Each credit already carries one
 * inside itself — the live values are «Monica Arellano-Ongpin · CC BY 2.0» — so a second interpunct
 * between two of them produced «… CC BY 2.0 · Aries Tottle …», in which no reader can tell which dot
 * divides a photographer from their licence and which divides one photographer from the next. Laying
 * them out instead of punctuating them also keeps the bidi straight: each credit is a Latin island with
 * `dir`, which isolates it, and there is no neutral character left between two islands to be reordered.
 */
function PhotoCredits({ credits, label }: { credits: { text: string; url: string | null }[]; label: string }) {
  return (
    <p className="flex min-w-0 basis-full flex-wrap items-baseline gap-x-cozy gap-y-hair leading-5 sm:basis-auto">
      {label ? <span>{label}:</span> : null}
      {credits.map((credit) =>
        credit.url ? (
          <a key={credit.text} href={credit.url} dir="ltr" rel="noopener" className="underline-offset-2 hover:text-paper hover:underline">
            {credit.text}
          </a>
        ) : (
          <span key={credit.text} dir="ltr">
            {credit.text}
          </span>
        ),
      )}
    </p>
  );
}
