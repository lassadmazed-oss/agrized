import Link from "@/components/site/link";
import { SitePhoto } from "@/components/site/site-photo";
import { abroadPhotoSlot } from "@/lib/abroad";
import { flagState, t, type PublicConfig } from "@/lib/config";

/**
 * «عايش برّا تونس؟» — the home page's invitation to /abroad (0130). A server component: one card, three words of
 * the owner's and a picture, nothing that needs the browser. It draws nothing while the module `abroad` is not
 * public, so the home page loses the card the moment the owner closes the page it leads to.
 */
export function AbroadBand({ config }: { config: PublicConfig }) {
  if (flagState(config, "abroad") !== "public") return null;
  return (
    <section className="mt-6 md:mt-10">
      <Link
        href="/abroad"
        className="group relative grid overflow-hidden rounded-3xl bg-forest text-paper shadow-[var(--shadow-card)] sm:grid-cols-[1.2fr_1fr]"
      >
        <div className="relative z-1 p-5 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-paper/12 px-3 py-1 text-caption font-semibold text-gold-bright">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" />
            </svg>
            {t(config, "ui.abroad.eyebrow")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">{t(config, "ui.abroad.home_title")}</h2>
          <p className="mt-2 max-w-md leading-7 text-paper/85">{t(config, "ui.abroad.home_text")}</p>
          <span className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-gold-bright px-5 font-semibold text-ink transition-transform group-hover:-translate-y-0.5">
            {t(config, "ui.abroad.home_cta")}
            <span aria-hidden="true" className="inline-block ltr:-scale-x-100">
              ←
            </span>
          </span>
        </div>
        {/* The picture sits beside the words on a wide screen and under them on a phone — never behind them. */}
        <div className="relative min-h-40 sm:min-h-full">
          <SitePhoto config={config} slot={abroadPhotoSlot(config)} fill sizes="(min-width: 640px) 40vw, 100vw" />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-forest/40 to-transparent sm:bg-linear-to-l sm:from-forest/50 sm:to-transparent ltr:sm:bg-linear-to-r" />
        </div>
      </Link>
    </section>
  );
}
