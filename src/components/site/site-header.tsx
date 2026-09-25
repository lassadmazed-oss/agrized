import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { offersTitle } from "@/components/site/offers";
import { flagState, getPublicConfig, settingText, type PublicConfig } from "@/lib/config";

type SiteHeaderProps = {
  tagline: string;
  showInterestCta: boolean;
  /** Modules that are open to the public; a link is never shown for a page that is not there yet. */
  showProjects: boolean;
};

/**
 * The calculator's own word (owner, 2026-09-19: «نظّم المنصة من الأول إلى الآخر»).
 *
 * The site has exactly two ways in and they must never borrow each other's words: /start answers with an
 * estimate, /projects sells numbered olive trees. «سجّل اهتمامك» is the act of filing a request — it belongs
 * to the form at the end of the calculator and to the form on an offer page, and to nothing else. Every
 * control that opens the calculator says what the calculator does.
 */
export function estimateLabel(config: PublicConfig): string {
  return settingText(config, "site.cta_estimate_label") || settingText(config, "site.unit_cta", "احسب مشروعك");
}

/** «كيفاش تخدم AgriZed؟» — the heading of the home page's own section, and the label of every link to it. */
export function howTitle(config: PublicConfig): string {
  return settingText(config, "site.how_title", "كيفاش تخدم AgriZed؟");
}

/** «عندك أرض أو ضيعة؟» — the landowner door, named the same on the home page and in the footer. */
export function landTitle(config: PublicConfig): string {
  return settingText(config, "site.land_title", "عندك أرض أو ضيعة؟");
}

/**
 * The main call to action (report v3 §17, spec v2 §5): target from settings, label from the act it performs.
 * v2 starts every journey with the tree question, so anything but an explicit "register" opens /start — and
 * while it does, it carries the calculator's word, not the form's. Emptying `site.cta_primary_label` still
 * hides the button everywhere, exactly as before.
 */
export function primaryCta(config: PublicConfig): { label: string; href: "/start" | "/register" } {
  const href = settingText(config, "site.cta_primary_target", "start") === "register" ? "/register" : "/start";
  const configured = settingText(config, "site.cta_primary_label", "سجّل اهتمامك");
  return { label: configured ? (href === "/start" ? estimateLabel(config) : configured) : "", href };
}

export type SiteLink = { href: string; label: string };

/**
 * The site's table of contents, printed by the header and by the footer from this one list (owner,
 * 2026-09-19). Two rules hold it together: a destination appears only while it is actually on the site, and
 * its label is read from the very setting its destination is titled with — so a link and the section it
 * opens can never carry two different words.
 *
 * 2026-09-21: «الرئيسية» opens the list, which is what the reference draws in both menus — the bar at the
 * top and the «روابط سريعة» column of the footer. It is the one entry with no module behind it, so it is
 * the one entry that is always there; emptying `site.nav_home_label` still removes it, like every other.
 */
export function siteNav(config: PublicConfig): SiteLink[] {
  const links: SiteLink[] = [];
  const home = settingText(config, "site.nav_home_label", "الرئيسية");
  if (home) links.push({ href: "/", label: home });
  // What is real comes first.
  if (flagState(config, "projects") === "public") links.push({ href: "/projects", label: offersTitle(config) });
  if (flagState(config, "interest_form") === "public") links.push({ href: "/start", label: estimateLabel(config) });
  // «كيفاش تخدم AgriZed؟» is not in the bar any more (owner, 2026-09-23: one composition, the phone's).
  // The four steps it pointed at were part of the wide screen's second home page, and that page is gone —
  // the link survived it for a few minutes as an anchor to an id nothing renders, which is worse than no
  // link at all: it looks like navigation and does nothing. `site.how_it_works` is untouched, so putting
  // the section back anywhere restores the entry by restoring these two lines.
  if (flagState(config, "public_statistics") === "public")
    links.push({ href: "/#million", label: settingText(config, "site.progress_title", "وين وصلنا؟") });
  if (flagState(config, "land_offers") === "public") links.push({ href: "/land", label: landTitle(config) });
  return links;
}

/**
 * The bar, rebuilt to the owner's reference drawing (2026-09-21).
 *
 * WHAT CHANGED, and why each one: the bar used to be a flush paper-tinted slab with a hairline under it and
 * square corners — a bar that belongs to the top of the window. The drawing detaches it: a white card with
 * rounded ends and a wide soft shadow, floating clear of the top edge, over the hero photograph rather than
 * above it. So:
 *
 *  · the surface is `--color-surface` (opaque white, #FFF) with `--shadow-float`, no border and no blur. The
 *    blur it used to carry was doing the work a shadow does, and doing it worse over a photograph;
 *  · the logo becomes a LOCKUP: the drawn olive mark, then the wordmark with the tagline UNDER it rather
 *    than beside it — which is what lets the tagline show at every width instead of only from xl up;
 *  · the nav loses its hover pills and gains the drawing's gold underline on the current section (.nav-link,
 *    globals.css);
 *  · the button grows to the drawing's height and its near-pill radius and takes the calculator glyph at its
 *    END — the side an RTL reader leaves the label on.
 *
 * It stays a SERVER component: nothing here reads the client router, nothing hydrates, and the only state
 * the bar has is which module is open. That is also why the current section is marked in CSS rather than
 * with `usePathname()` — see the `.nav-link` rule.
 *
 * WHAT THE DRAWING HAS AND THIS DOES NOT, both reported to the owner rather than faked:
 *  · the «FR» lozenge. There is no French route, no locale and no _fr page anywhere in the app; the only
 *    French the site renders is printed INLINE beside the Arabic on /start (bilingual.tsx), which is a
 *    page-scoped exception, not a language. A control in the bar that changes nothing is a claim about the
 *    product that is not true, and this is a product whose argument is «بلا وعود»;
 *  · the hamburger standing beside a full four-item nav at 1790px. It opens nothing in the drawing and
 *    duplicates a menu that is already entirely visible. Between md and lg its job is done by the chip row
 *    under the bar and below md by the phone's own tab bar — neither of which needs an open state, hides a
 *    link behind a tap, or can be left hanging open over the page by a client-side navigation the way a
 *    <details> panel would be.
 */
export async function SiteHeader({ tagline, showInterestCta, showProjects }: SiteHeaderProps) {
  const config = await getPublicConfig();
  const cta = primaryCta(config);
  // The same word the phone's tab bar prints under the account icon, from the same setting, so renaming it
  // in الإعدادات renames it in both places. It is the icon's accessible name, never drawn as text here.
  const accountLabel = settingText(config, "zitounti.screen_title", "حسابي");
  // The account icon closes the bar, so it is the element that must push to the end — but only when the
  // calculator button before it is not already doing that. Two `ms-auto` in one flex row means the first
  // one wins and the second is dead weight; none at all, on a bar whose nav is hidden below lg, leaves the
  // icon sitting against the wordmark.
  const accountPush = showInterestCta && cta.label ? "" : "ms-auto";
  // The button beside the nav is already one of the doors; listing it twice in one bar is the «double
  // buttons» the owner asked to end. The offers row honours the module state the layout read.
  const links = siteNav(config).filter((link) => {
    if (link.href === "/projects") return showProjects;
    if (showInterestCta && cta.label && link.href === cta.href) return false;
    return true;
  });

  return (
    /* The header itself is only air: the padding is the gap the bar floats in, and the page scrolls through
       it. `.site-header` carries the position — sticky everywhere, and fixed over the photograph on the home
       page, which is the one page that opens with a full-bleed picture (globals.css). The gap is kept small
       on purpose: the taller it is, the more of the page slides visibly past above the bar. */
    <header className="site-header px-3 pt-2 sm:px-4 lg:px-6 lg:pt-3">
      {/* BELOW md THE CARD HUGS WHAT IS IN IT (owner, 2026-09-21: «still ugly», with a crop of this bar).
          Once the chip row left the phone, everything else in this card was already hidden there — the nav
          from lg, the button from md — so a full-width card was 375px of white holding one 165px lockup, two
          thirds of it nothing, laid across the top of the photograph like a sticker. A bar is a bar because
          it spans; a thing that spans and is empty reads as a mistake. So on a phone it stops spanning and
          becomes what it actually is: a badge with the name on it, sitting at the start edge with the
          photograph running past it. `max-w-full` keeps it inside the screen if the tagline is ever made
          longer. From md up, where the card carries the button and then the nav, it spans again exactly as
          it did. Nothing is added to fill it: navigation on a phone belongs to the tab bar at the foot. */}
      {/* THE PILL IS A WIDE-SCREEN THING (owner, 2026-09-22: «i dont like this, this ugly»). A white rounded
          box with a float shadow exists so the bar can sit ON the desktop hero photograph. A phone screen
          opens on paper, so the pill floats over nothing, and a heavy shadow with nothing under it reads as
          a card that lost its page. On a phone it is a plain bar on the page ground with a hairline under
          it; the pill returns from `md`, where the photograph it was drawn for actually is. */}
      <div className="me-auto w-full max-w-full overflow-hidden border-b border-line bg-paper md:mx-auto md:w-auto md:max-w-6xl md:rounded-[1.5rem] md:border-0 md:bg-surface md:shadow-[var(--shadow-float)] lg:rounded-[1.75rem]">
        <div className="flex items-center gap-cozy px-3 py-2 max-md:justify-end sm:px-4 lg:px-6 lg:py-3">
          {/* THE LOCKUP: mark, then the name with what the name promises under it. Stacking the tagline
              rather than setting it beside the wordmark is what lets it show at EVERY width — it used to
              appear only from xl up, which is to say almost never. */}
          <Link href="/" className="flex shrink-0 flex-row-reverse items-center gap-snug rounded-xl" aria-label="AgriZed، الصفحة الرئيسية">
            <OliveLeafMark className="size-10 lg:size-12" />
            <span className="flex flex-col">
              <Wordmark className="text-[1.25rem] leading-none md:text-[1.5rem] lg:text-[1.85rem]" />
              {tagline ? <span className="mt-0.5 text-[0.6875rem] leading-tight text-muted md:mt-1 md:text-[0.78rem]">{tagline}</span> : null}
            </span>
          </Link>

          {/* The full nav appears from lg. Between md and lg the four Arabic labels, the lockup and the
              button do not fit one 768px row, so the chip row below carries the sections there — the same
              links, no smaller, and nothing hidden behind a control. */}
          <nav aria-label="أقسام الموقع" className="hidden flex-1 justify-center lg:flex">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  {/* data-nav="home" is how the home page's own marker reaches its entry; every other
                      destination is marked with aria-current by whoever knows it is current. */}
                  <Link href={link.href} data-nav={link.href === "/" ? "home" : undefined} className="nav-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Always reachable while scrolling from md up; below that the fixed bar at the foot of the phone
              screen carries it (sticky-cta.tsx), and printing it in both places is the duplication the
              owner named. The two breakpoints are deliberately the same one. */}
          {showInterestCta && cta.label ? (
            <Link
              href={cta.href}
              className="btn btn-primary ms-auto hidden min-h-12 rounded-[1.5rem] px-6 md:inline-flex lg:ms-0 lg:min-h-14 lg:px-7 lg:text-[1.0625rem]"
            >
              {cta.label}
              <CalculatorMark className="size-5" />
            </Link>
          ) : null}

          {/* حسابي — THE ACCOUNT DOOR, FROM md UP AND NOWHERE ELSE.
              Below md it is not printed, and that is the same rule the calculator button above obeys: the
              phone's bottom tab bar already carries «حسابي» (mobile/tab-bar.tsx is `md:hidden`, and the two
              breakpoints are deliberately the same one). Printing it in both places is the duplication the
              owner has named twice, and on a 375px bar there is no room for it anyway.
              It is an ICON AND NOT A LABELLED BUTTON because the bar already has one filled button and a
              second one competes with it — the calculator is what this page is selling, the account is what
              a returning visitor already knows to look for in this corner. `aria-label` carries the name the
              owner writes, so a screen reader is told what the icon never says out loud. */}
          <Link
            href="/zitounti"
            aria-label={accountLabel}
            title={accountLabel}
            className={`hidden size-12 shrink-0 items-center justify-center rounded-[1.25rem] border border-line bg-surface text-forest transition-colors hover:border-forest/30 hover:bg-leaf-soft md:inline-flex lg:size-14 ${accountPush}`.trim()}
          >
            <AccountMark className="size-5 lg:size-6" />
          </Link>
        </div>

        {/* BETWEEN md AND lg the bar has no room for the nav and the phone's bottom tab bar is not there
            either (mobile/tab-bar.tsx is `md:hidden`), so the sections ride here as chips — the same row the
            header has always carried, moved inside the floating card so the bar still reads as one object.

            BELOW md it is not printed. The tab bar at the foot of the phone screen now carries الرئيسية,
            عروضنا and the calculator (layout.tsx, owner 2026-09-21), and printing the same destinations
            again at the top is the duplication the owner has named twice — it also costs this page 53px of
            the hero's photograph, which at 375 is most of what is left of it. What the tab bar does not
            hold is #how and #million, and those are sections of this page: on a phone they are reached by
            scrolling, which is what a landing page is for. */}
        {links.length > 0 ? (
          <nav aria-label="أقسام الموقع" className="hidden border-t border-line/70 md:block lg:hidden">
            <ul className="flex flex-wrap justify-center gap-tight px-3 py-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="chip whitespace-nowrap px-3 py-1.5 text-label font-medium text-forest transition-colors hover:bg-leaf-soft"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The mark of the lockup: an olive leaf held in a gold curve.
 *
 * The reference draws a logo we hold no asset for — `Wordmark` is text only, «Agri» forest and «Zed» gold —
 * so it is drawn here in the same line vocabulary the site already uses for its olive drawings
 * (site-photo.tsx, tree-card.tsx). No file is downloaded and no icon library is added; it is decoration, so
 * it is aria-hidden and the link beside it carries the name.
 */
function OliveLeafMark({ className = "size-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      {/* the gold curve the leaf rests in */}
      <path
        d="M5.5 21.5c0 11.6 9.4 21 21 21 5.4 0 10.3-2 14-5.4"
        className="stroke-gold-bright"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* the leaf */}
      <path
        d="M42.4 4.2c-13.6.5-24 6.3-28 14.9-2.5 5.3-1.9 11.1 1 15 4.9-1.2 10.2-4.5 14.5-9.2 6.4-7 11.9-14.1 12.5-20.7Z"
        className="fill-forest"
      />
      {/* its midrib, drawn in paper so the leaf reads as a leaf at 40px */}
      <path
        d="M38.6 7.8C29.4 13.7 21.6 22.3 16.3 33"
        className="stroke-paper"
        fill="none"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

/**
 * The account glyph. Deliberately the SAME drawing as the phone tab bar's `account` icon
 * (mobile/tab-bar.tsx) — a head and two shoulders on the 24px grid — because they are one destination
 * reached from two places, and two different people-marks in one product is how an interface starts
 * looking assembled rather than designed. Stroked at 1.6 to sit beside CalculatorMark, not the tab bar's
 * 2, which is tuned for 24px on a phone.
 */
function AccountMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.2 20.2a6.8 6.8 0 0 1 13.6 0" />
    </svg>
  );
}

/** The glyph the drawing puts at the end of the bar's button: what the button opens is a calculator. */
function CalculatorMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="4.25" y="2.75" width="15.5" height="18.5" rx="3.25" />
      <path d="M8.25 7.5h7.5" />
      <path
        d="M8.75 12.4h.01M12 12.4h.01M15.25 12.4h.01M8.75 16.6h.01M12 16.6h.01M15.25 16.6h.01"
        strokeWidth="2.6"
      />
    </svg>
  );
}
