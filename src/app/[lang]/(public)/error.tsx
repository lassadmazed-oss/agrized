"use client";

import { useEffect } from "react";

import Link from "@/components/site/link";
import { useT } from "@/lib/i18n/client";

/**
 * Whatever a public page throws in the browser lands here instead of the blank screen the App Router shows without
 * a boundary (owner, 2026-09-16: «i get white screen»). The visitor reads a message in their own language and
 * retries the same page without losing the address, and the error reaches the console so the next report carries
 * a name.
 *
 * AN ERROR BOUNDARY IS A CLIENT COMPONENT AND CANNOT READ SETTINGS, so its words (ui.pages.error_*,
 * ui.pages.back_home) must already be in a TextProvider above it — the layouts hand them down. That is also why it
 * asks for nothing else: the page that crashed may be the one that was supposed to provide them.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();

  useEffect(() => {
    console.error("public page error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="font-display text-3xl font-bold text-forest">{t("ui.pages.error_title")}</h1>
      <p className="mt-3 leading-7 text-muted">{t("ui.pages.error_text")}</p>
      {error.digest ? (
        <p className="mt-3 text-xs text-muted">
          {t("ui.pages.error_code_label")} <span dir="ltr">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          {t("ui.pages.error_retry")}
        </button>
        <Link href="/" className="btn btn-secondary">
          {t("ui.pages.back_home")}
        </Link>
      </div>
    </div>
  );
}
