import Link from "next/link";

import { flagState, getPublicConfig, settingText } from "@/lib/config";

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
 */
export async function NotFoundView() {
  const config = await getPublicConfig().catch(() => null);
  const text = (key: string, fallback: string) => (config ? settingText(config, key, fallback) : fallback) || fallback;
  const offersOpen = config ? flagState(config, "projects") === "public" : false;

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="font-display text-7xl font-bold text-leaf sm:text-8xl" dir="ltr">
        404
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold text-forest sm:text-4xl">
        {text("site.not_found_title", "الصفحة هاذي ما لقيناهاش")}
      </h1>
      <p className="mt-3 max-w-md leading-7 text-muted">
        {text(
          "site.not_found_text",
          "يمكن الرابط تبدّل، ولّا العرض هذا ما عادش متوفّر. ارجع للصفحة الرئيسية ولّا شوف العروض الموجودة توّا.",
        )}
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="btn btn-primary">
          الصفحة الرئيسية
        </Link>
        {offersOpen ? (
          <Link href="/projects" className="btn btn-secondary">
            {text("offers.title", "عروضنا")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
