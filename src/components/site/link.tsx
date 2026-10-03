"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

import { useLocale } from "@/lib/i18n/client";
import { localePath } from "@/lib/i18n/locales";

/**
 * next/link that stays in the visitor's language: `href="/projects"` is «/fr/projects» on the French site.
 * The public site imports this one instead of next/link, so a link written in Arabic-site terms needs no
 * thought about languages. Absolute URLs, `tel:`, `#anchors` and the Back Office pass through untouched.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const localized =
    typeof href === "string"
      ? localePath(locale, href)
      : { ...href, pathname: href.pathname ? localePath(locale, href.pathname) : href.pathname };
  return <NextLink href={localized} {...props} />;
}
