"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { siteFormat, type FormatUnits, type SiteFormat } from "@/lib/format";

import { DEFAULT_LOCALE, LOCALE_DIR, localePath, type Locale } from "./locales";
import { formatMessage, type MessageVars } from "./message";

/**
 * The language and the owner's texts, for Client Components.
 *
 * The `[lang]` layout provides the language, the units and the few texts every screen shares (`ui.common.*`).
 * A page that renders a Client Component with words of its own wraps it in <Texts prefixes={[…]}> (server,
 * src/components/site/texts.tsx), which nests another provider carrying just those keys — so a form's twenty
 * sentences travel with the form and nowhere else. Nested providers merge: the inner one adds, never hides.
 */

type I18nValue = {
  locale: Locale;
  units: FormatUnits;
  texts: Record<string, string>;
};

const ARABIC_UNITS: FormatUnits = { currency: "د.ت", m2: "م²", m: "م" };
const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, units: ARABIC_UNITS, texts: {} });

export function TextProvider({
  locale,
  units,
  texts,
  children,
}: {
  locale?: Locale;
  units?: FormatUnits;
  texts: Record<string, string>;
  children: ReactNode;
}) {
  const parent = useContext(I18nContext);
  const value = useMemo<I18nValue>(
    () => ({
      locale: locale ?? parent.locale,
      units: units ?? parent.units,
      texts: { ...parent.texts, ...texts },
    }),
    [locale, units, texts, parent],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useDir(): "rtl" | "ltr" {
  return LOCALE_DIR[useContext(I18nContext).locale];
}

/**
 * `const t = useT(); t("ui.login.title")`, `t("ui.login.code_sent", { minutes: 5 })`. A key the providers above
 * do not carry prints itself, so a missing <Texts prefixes> shows up on the page instead of failing silently.
 */
export function useT(): (key: string, vars?: MessageVars) => string {
  const { locale, texts } = useContext(I18nContext);
  return useMemo(
    () => (key: string, vars?: MessageVars) => {
      const value = texts[key];
      return value === undefined ? key : formatMessage(locale, value, vars);
    },
    [locale, texts],
  );
}

/** Number, money, date and area formatting in the page's language. */
export function useFormat(): SiteFormat {
  const { locale, units } = useContext(I18nContext);
  return useMemo(() => siteFormat(locale, units), [locale, units]);
}

/** `href("/projects")` → «/fr/projects» on the French site, «/projects» on the Arabic one. */
export function useLocaleHref(): (path: string) => string {
  const locale = useLocale();
  return useMemo(() => (path: string) => localePath(locale, path), [locale]);
}
