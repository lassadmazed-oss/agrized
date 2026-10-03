import Link from "@/components/site/link";
import { flagState, getPublicConfig, t } from "@/lib/config";

/**
 * The page that is not there.
 *
 * The project had no 404 of its own, so every mistyped address and every offer code that no longer exists —
 * notFound() is thrown in seven files — fell through to Next's default: an English, left-to-right page outside
 * the Arabic shell, with no way back into the site. This is that page, in the site's own language and colours.
 *
 * It is deliberately short and gives exactly two ways out: the home page, and the offers, which is where a
 * visitor who reached a dead offer link wanted to go. «عروضنا» is named and gated from settings like everywhere
 * else, so a closed module never advertises itself from the error page.
 *
 * It reads the configuration without a safety net, and it can afford to: it only ever renders inside the `[lang]`
 * root layout, which has already read the same (cached) configuration to draw `<html>` — had that failed, the
 * visitor would be on global-error, not here.
 */
export async function NotFoundView() {
  const config = await getPublicConfig();
  const offersOpen = flagState(config, "projects") === "public";

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="font-display text-7xl font-bold text-leaf sm:text-8xl" dir="ltr">
        404
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold text-forest sm:text-4xl">{t(config, "site.not_found_title")}</h1>
      <p className="mt-3 max-w-md leading-7 text-muted">{t(config, "site.not_found_text")}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="btn btn-primary">
          {t(config, "ui.pages.not_found_home")}
        </Link>
        {offersOpen ? (
          <Link href="/projects" className="btn btn-secondary">
            {t(config, "offers.title")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
