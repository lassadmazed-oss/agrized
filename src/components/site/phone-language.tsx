import { LanguageSwitcher } from "@/components/site/language-switcher";
import { getPublicConfig, t } from "@/lib/config";

/**
 * The language choice on a phone (0109). The header that carries the selector is not drawn below `md` — the
 * phone screens open on their own compositions and navigate by the tab bar — so the choice is offered where a
 * phone visitor looks for their preferences: the account tab, and the top of the home screen. From `md` up the
 * header's selector is on every page and this hides.
 */
export async function PhoneLanguage({ className = "" }: { className?: string }) {
  const config = await getPublicConfig();
  if (config.locales.length < 2) return null;
  return (
    <section aria-label={t(config, "ui.common.language")} className={`md:hidden ${className}`.trim()}>
      <p className="mb-2 text-caption font-semibold text-muted">{t(config, "ui.common.language")}</p>
      <LanguageSwitcher choices={config.locales} variant="pills" />
    </section>
  );
}
