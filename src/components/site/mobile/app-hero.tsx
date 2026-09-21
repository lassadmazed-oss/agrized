import Link from "next/link";

import { HERO_SLOTS } from "@/components/site/landing/hero";
import { PhotoMarquee } from "@/components/site/landing/photo-marquee";
import { settingText, type PublicConfig } from "@/lib/config";

/**
 * The phone's first screen (owner, 2026-09-21, from an AgriZed app mock-up): a photograph of the grove running
 * down to the bay, the promise written over its foot, and one door out of it.
 *
 * The mock-up opens with «أهلاً بيك يا لسعد», a notification bell and an avatar — the furniture of a signed-in
 * app. This product has no public accounts: a visitor has never told us their name, and the client space that
 * would know it (`zitounti`) is disabled and has no way to sign in. So the greeting is to nobody in particular,
 * the bell would ring for nothing, and the avatar would be a stranger's face. They are not here. What is here
 * is the part that works without an account, which is the whole page a visitor actually came for.
 *
 * It renders on phones only. The desktop hero is a different composition and lives in ../landing/hero.
 */
export function AppHero({ config, href }: { config: PublicConfig; href: string }) {
  const line = settingText(config, "site.app_hero_line", "زيتونتك اليوم… أصل لعمر كامل.");
  const cta = settingText(config, "site.app_hero_cta", "إستكشف المشاريع");

  const greeting = settingText(config, "site.app_greeting", "أهلاً بيك");
  const greetingNote = settingText(config, "site.app_greeting_note", "نحو مستقبل أكثر خضرة 🌿");

  return (
    /* pt clears the header. On the home page that bar is FIXED so it can float over the desktop hero's
       photograph — but this phone screen opens on a greeting set on paper, not on a picture, so the bar had
       nothing to float over and sat on top of the words instead (measured: 52px of overlap). 5.5rem is the
       68px bar plus air, which is also the gap the mock-up leaves between its top row and «أهلاً بيك». */
    <section className="px-4 pb-cozy pt-[5.5rem] md:hidden">
      {/* The mock-up opens «أهلاً بيك يا لسعد». It is not addressed to anyone here, because nobody has told us
          their name: there is no public account in this product, so a name on this line could only be invented.
          The line itself is the mock-up's and stays — a greeting to whoever opened the app is still a greeting. */}
      {greeting ? (
        <div className="pb-cozy text-center">
          <p className="font-display text-3xl font-bold leading-tight text-forest">{greeting}</p>
          {greetingNote ? <p className="mt-1 text-label text-muted">{greetingNote}</p> : null}
        </div>
      ) : null}

      {/* The whole card is the link. A photograph with a button floating on it invites a tap anywhere, and on a
          phone the thumb lands where the eye is, not where the button is. */}
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-3xl shadow-[var(--shadow-card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
      >
        {/* The card's picture drifts through the site's grove photographs rather than holding one still
            (owner, 2026-09-21: «i want the thing to feel alive»). Same strip and same order as the desktop
            hero, so the two screens are showing the same place. Quicker here than there — this photograph
            carries one line of text, not a whole composition. */}
        <PhotoMarquee config={config} slots={HERO_SLOTS} aspect="4/3" seconds={6} priority sizes="100vw" />

        {/* Strong where the words are, absent where the sky is: the bay is the reason this photograph is here. */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-forest-700/90 via-forest-700/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="font-display text-2xl font-bold leading-snug text-surface drop-shadow-sm">{line}</p>
          {cta ? (
            <span className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-label font-semibold text-surface shadow-[var(--shadow-raise)] transition-transform group-active:scale-[0.98]">
              {cta}
              <span aria-hidden="true">←</span>
            </span>
          ) : null}
        </div>
      </Link>
    </section>
  );
}
