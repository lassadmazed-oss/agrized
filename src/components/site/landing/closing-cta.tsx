import Link from "next/link";

import { SitePhoto } from "@/components/site/site-photo";
import { settingText, type PublicConfig } from "@/lib/config";

type ClosingCtaProps = {
  config: PublicConfig;
  /**
   * The calculator's own word (estimateLabel). Empty prints no button — and a card that asks for nothing is
   * not printed at all, so the caller gates the whole block on the interest module exactly as it does today.
   */
  ctaLabel: string;
  /** Where the button goes. The site has one calculator and every control that opens it says the same word. */
  ctaHref?: string;
  /**
   * The second door, kept only if the integrator wants it. The reference draws ONE button here: the offers
   * are already reachable from the header, the hero door and the offers section, and a second filled bar in
   * a 228px card is the «double buttons» the owner named on 2026-09-18. Omit it to match the drawing.
   */
  offers?: { label: string; href: string } | null;
};

/**
 * The last ask of the home page: «ابدأ امتلاكك اليوم».
 *
 * Reference image 2 draws it as a dark forest card with a photograph bleeding off its END edge, the words
 * and the button held on the green half at the inline start, and a quiet «أو تواصل معنا» under the button.
 * Three things it is NOT, and each is a rule rather than a taste:
 *
 *  · It prints no amount, so it carries no `.card-estimate` surface. That ground exists to mark a figure as
 *    a simulation (globals.css); the estimate warning travels with the calculator door in the hero, where
 *    the figure is. Wearing the dashed edge here would spend the signal on a card that says nothing numeric.
 *  · The photograph is `home.closing`. It is free only because the page's old closing band — which printed
 *    the wordmark, `site.closing_title` and `site.vision_text` over this same slot, about 140px above a
 *    footer that printed the wordmark again — is removed in the same rebuild. If that band survives, this
 *    card and it show one photograph twice in one screen.
 *  · Every sentence is a setting. The reference's «كن جزءاً من مستقبل أكثر خضرة في تونس.» is the generator's
 *    wording, not the owner's; what prints is `site.final_cta_note` and the two keys the page already reads.
 */
export function ClosingCta({ config, ctaLabel, ctaHref = "/start", offers = null }: ClosingCtaProps) {
  const title = settingText(config, "site.final_cta_title", "ابدا أصلك اليوم، على قدّ إمكانياتك");
  const note = settingText(config, "site.final_cta_note");
  const contactLabel = settingText(config, "site.final_cta_contact_label", "أو تواصل معنا");
  // The drawing's chat bubble opens a real conversation or it is not drawn: WhatsApp first, the telephone
  // after it, nothing at all when the owner has filled in neither.
  const whatsapp = settingText(config, "site.contact_whatsapp").replace(/\D/g, "");
  const phone = settingText(config, "site.contact_phone");
  const contactHref = whatsapp ? `https://wa.me/${whatsapp}` : phone ? `tel:${phone}` : "";

  if (!title && !ctaLabel) return null;

  return (
    <div className="relative isolate overflow-hidden rounded-2xl bg-forest-700 shadow-[var(--shadow-card)]">
      {/* The picture takes the card's END side and bleeds to three of its edges. Below `sm` it would leave
          the words about 200px of usable width, so it becomes a band across the card's top instead — see the
          text block's padding below, which is what actually moves. */}
      <div className="absolute inset-x-0 top-0 h-36 sm:inset-y-0 sm:start-auto sm:end-0 sm:h-auto sm:w-[38%]">
        <SitePhoto config={config} slot="home.closing" fill sizes="(min-width: 640px) 22vw, 100vw" />
        {/* No seam where the photograph meets the green: it dissolves into the card's own ground. The axis is
            written physically because this document is RTL at the root (src/app/layout.tsx) and never
            anything else — `to-b` at a phone, `to-l` (toward the end) from sm up, which is the side the
            picture sits on. The same convention the progress bar already uses (million-counter.tsx). */}
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-forest-700 sm:bg-linear-to-l sm:from-forest-700 sm:via-forest-700/55 sm:to-transparent" />
      </div>

      <div className="relative p-card pt-40 sm:p-roomy sm:pt-roomy sm:pe-[40%]">
        <h2 className="font-display text-2xl font-bold leading-tight text-paper text-balance sm:text-3xl">{title}</h2>

        {/* The button, then the contact line centred under it — the drawing's own stack. It is a column so
            that at 375 the button can take the full width without the contact line stretching with it. */}
        <div className="mt-cozy flex flex-col items-stretch gap-snug sm:inline-flex sm:items-center">
          {ctaLabel ? (
            <Link
              href={ctaHref}
              className="btn bg-paper text-forest-700 shadow-[var(--shadow-raise)] hover:bg-surface"
            >
              {ctaLabel}
              <ForwardArrow />
            </Link>
          ) : null}

          {contactHref ? (
            <a
              href={contactHref}
              rel="noopener"
              className="inline-flex min-h-11 items-center justify-center gap-tight text-caption font-semibold text-gold-bright underline underline-offset-4 hover:text-paper"
            >
              <ChatGlyph />
              {contactLabel}
            </a>
          ) : null}

          {offers?.label ? (
            <Link
              href={offers.href}
              className="btn btn-ghost text-paper hover:bg-paper/10"
            >
              {offers.label}
            </Link>
          ) : null}
        </div>

        {/* «التسجيل مجاني وما يلزمك بشيء.» The reference leaves it out; it stays, because it is the sentence
            that makes the button safe to press. StickyCta prints the same setting at the foot of a phone
            screen — the overlap is the owner's to settle, and losing the line is the worse of the two. */}
        {note ? <p className="mt-snug text-caption leading-6 text-paper/70">{note}</p> : null}
      </div>
    </div>
  );
}

/**
 * The arrow in the button. It points toward the physical left, which on this document — `dir="rtl"` on
 * <html>, with no other locale in the app — is forward, exactly as the reference draws it.
 */
function ForwardArrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10H4" />
      <path d="M8.5 5.5 4 10l4.5 4.5" />
    </svg>
  );
}

/** A speech bubble: «تواصل معنا» opens a conversation, so it is drawn as one. */
function ChatGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 9.5c0 3.3-3.1 6-7 6a8 8 0 0 1-2.2-.3L4 16.5l1-2.7A5.7 5.7 0 0 1 3 9.5c0-3.3 3.1-6 7-6s7 2.7 7 6Z" />
    </svg>
  );
}
