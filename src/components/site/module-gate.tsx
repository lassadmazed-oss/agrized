import Link from "@/components/site/link";
import { getPublicConfig, t } from "@/lib/config";

/*
 * What a module's page shows while its flag keeps it closed (ComingSoon) or open to the team only
 * (PreviewBanner). Server Components that read their own words (ui.pages.*) in the request's language, so the
 * pages that gate on a flag pass nothing but the title they already have.
 */

export async function ComingSoon({ title }: { title: string }) {
  const config = await getPublicConfig();
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold text-gold">{t(config, "ui.pages.coming_soon_eyebrow")}</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-forest text-balance">{title}</h1>
      <p className="mt-4 leading-7 text-muted">{t(config, "ui.pages.coming_soon_text")}</p>
      <Link href="/" className="btn btn-secondary mt-8">
        {t(config, "ui.pages.back_home")}
      </Link>
    </section>
  );
}

export async function PreviewBanner() {
  const config = await getPublicConfig();
  return (
    <div role="status" className="border-b border-gold/30 bg-gold-soft px-4 py-2 text-center text-sm font-medium text-forest-700">
      {t(config, "ui.pages.preview_banner")}
    </div>
  );
}
