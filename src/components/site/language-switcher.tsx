"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent as ReactMouseEvent } from "react";

import { rememberLanguage } from "@/app/[lang]/(public)/language-actions";
import { ChoicePanel, useChoicePanel } from "@/components/site/choice-panel";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE, LOCALE_DIR, localePath, splitLocale, type Locale } from "@/lib/i18n/locales";

export type LanguageChoice = { code: Locale; name: string };

type Variant = "header" | "row" | "list";

/**
 * The language selector (owner, 2026-10-03: «Language Selector واضح في الموقع»; redesigned the same evening:
 * «cleaner and hell modern»).
 *
 * EVERY CHOICE IS A REAL LINK to the same page in that language — /fr/projects, /projects for Arabic (through
 * /ar/…, which the proxy turns into «remember Arabic» and the one Arabic address). So it works with no
 * JavaScript, a search engine can follow it, and opening one in a new tab does the obvious thing.
 *
 * WHAT THE CLICK ADDS on top of the link: the cookie is written before leaving, so the very next request is
 * already in the new language, and — for a signed-in client — the choice is saved on their file
 * (persons.preferred_locale). A FULL PAGE LOAD, deliberately: the document changes direction between Arabic and
 * the others, and `<html dir>` belongs to the first byte.
 *
 * THREE FACES, ONE LIST. (A fourth, the glass chip on the home photograph, went when the chip moved into the
 * phone's header on 2026-10-05.)
 *   header  the bar's control: the globe, the language's code (its full name from 2xl: at 1280 the name and
 *           the share icon beside it did not both fit), a chevron. On a wide screen it opens a dropdown under
 *           itself; on a phone, a sheet.
 *   row     a settings row for the phone's account tab: «اللغة» and the current one, opening the sheet.
 *   list    plain links, for the footer's small print.
 *
 * THE PHONE GETS A SHEET, not a dropdown: a thumb reaches the bottom of the screen, five rows of 56px are
 * easy targets, and it is the shape the assistant already uses on this site. Both panels are drawn in a portal
 * on <body>, because the bar and the cards clip their overflow (that is how they keep their rounded corners).
 */
export function LanguageSwitcher({
  choices,
  variant = "header",
  className = "",
}: {
  choices: LanguageChoice[];
  variant?: Variant;
  className?: string;
}) {
  const locale = useLocale();
  const t = useT();
  const pathname = usePathname() ?? "/";
  const { panel, toggle, close, triggerRef, panelRef, panelId, titleId } = useChoicePanel({
    dropdownOnWide: variant === "header",
  });

  // The page's own path without its language: /fr/projects → /projects.
  const bare = splitLocale(pathname).path;
  const hrefFor = (code: Locale) => (code === "ar" ? `/ar${bare === "/" ? "" : bare}` : localePath(code, bare));

  if (choices.length < 2) return null;
  const current = choices.find((choice) => choice.code === locale) ?? choices[0];

  const choose = async (event: ReactMouseEvent<HTMLAnchorElement>, code: Locale) => {
    // A modified click (new tab, new window) is the browser's business.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (code === locale) {
      close();
      return;
    }
    writeLocaleCookie(code);
    // Only a visitor with a Supabase session can be a signed-in client; nobody else pays for the round trip.
    if (document.cookie.includes("sb-")) {
      await Promise.race([rememberLanguage(code).catch(() => null), new Promise((resolve) => setTimeout(resolve, 1500))]);
    }
    const { origin, search, hash } = window.location;
    window.location.assign(new URL(`${hrefFor(code)}${search}${hash}`, origin).toString());
  };

  if (variant === "list") {
    return (
      <nav aria-label={t("ui.common.language")} className={`flex flex-wrap items-center gap-x-cozy gap-y-tight ${className}`.trim()}>
        {choices.map((choice) => (
          <a
            key={choice.code}
            href={hrefFor(choice.code)}
            hrefLang={choice.code}
            lang={choice.code}
            dir={LOCALE_DIR[choice.code]}
            aria-current={choice.code === locale ? "true" : undefined}
            onClick={(event) => void choose(event, choice.code)}
            className="py-1 underline-offset-4 hover:underline aria-[current]:font-semibold aria-[current]:no-underline"
          >
            {choice.name}
          </a>
        ))}
      </nav>
    );
  }

  const label = `${t("ui.common.choose_language")} — ${current.name}`;
  const common = {
    ref: triggerRef,
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": panel !== null,
    "aria-controls": panel ? panelId : undefined,
    onClick: toggle,
  };

  const trigger =
    variant === "row" ? (
      <button
        {...common}
        aria-label={label}
        className={`flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-start shadow-[0_1px_2px_rgb(27_42_31/0.05)] transition-colors hover:border-forest/25 ${className}`.trim()}
      >
        <span className="grid size-10 flex-none place-items-center rounded-full bg-leaf-soft text-forest">
          <GlobeMark className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-muted">{t("ui.common.language")}</span>
          <span className="block font-semibold text-ink" lang={current.code} dir={LOCALE_DIR[current.code]}>
            {current.name}
          </span>
        </span>
        <ChevronMark open={panel !== null} className="size-4 text-muted" />
      </button>
    ) : (
      <button
        {...common}
        aria-label={label}
        title={t("ui.common.choose_language")}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface ps-2.5 pe-3 text-forest shadow-[0_1px_2px_rgb(27_42_31/0.05)] transition-colors hover:border-forest/25 hover:bg-leaf-soft aria-expanded:border-forest/30 aria-expanded:bg-leaf-soft md:h-12 md:rounded-[1.25rem] md:ps-3 md:pe-3.5 lg:h-14 ${className}`.trim()}
      >
        <GlobeMark className="size-[1.125rem] lg:size-5" />
        <span aria-hidden="true" className="text-[0.8125rem] font-bold 2xl:hidden" lang="en">
          {current.code.toUpperCase()}
        </span>
        <span aria-hidden="true" className="hidden text-sm font-semibold 2xl:inline" lang={current.code}>
          {current.name}
        </span>
        <ChevronMark open={panel !== null} className="size-3.5 opacity-70" />
      </button>
    );

  const rows = (kind: "sheet" | "dropdown") =>
    choices.map((choice) => {
      const isCurrent = choice.code === locale;
      return (
        <a
          key={choice.code}
          href={hrefFor(choice.code)}
          hrefLang={choice.code}
          aria-current={isCurrent ? "true" : undefined}
          onClick={(event) => void choose(event, choice.code)}
          className={`flex items-center gap-3 rounded-xl px-3 outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-forest/40 aria-[current]:bg-leaf-soft ${
            kind === "sheet" ? "min-h-14" : "min-h-11"
          }`}
        >
          <span
            aria-hidden="true"
            lang="en"
            className="grid size-8 flex-none place-items-center rounded-lg bg-paper text-[0.6875rem] font-bold text-forest ring-1 ring-inset ring-line"
          >
            {choice.code.toUpperCase()}
          </span>
          {/* The row keeps the list's own direction, so every name starts on the same edge; the name itself is
              an isolated run in its own direction, so «العربية» reads right to left inside a French list. */}
          <span className={`flex-1 text-start ${kind === "sheet" ? "text-base" : "text-sm"} ${isCurrent ? "font-semibold text-forest" : "text-ink"}`}>
            <span lang={choice.code} dir={LOCALE_DIR[choice.code]}>
              {choice.name}
            </span>
          </span>
          {isCurrent ? <CheckMark className="size-5 flex-none text-forest" /> : null}
        </a>
      );
    });

  const portal = (
    <ChoicePanel
      state={panel}
      panelRef={panelRef}
      panelId={panelId}
      titleId={titleId}
      title={t("ui.common.choose_language")}
      dropdownTitle={t("ui.common.language")}
      icon={<GlobeMark className="size-5" />}
      closeLabel={t("ui.common.close")}
      onClose={close}
    >
      {rows}
    </ChoicePanel>
  );

  return (
    <>
      {trigger}
      {portal}
    </>
  );
}

/** The choice, remembered for a year — the same cookie the proxy reads and writes (src/proxy.ts). */
function writeLocaleCookie(code: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function GlobeMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.5 12h17" />
      <path d="M12 3.25c2.4 2.5 3.6 5.4 3.6 8.75s-1.2 6.25-3.6 8.75c-2.4-2.5-3.6-5.4-3.6-8.75S9.6 5.75 12 3.25Z" />
    </svg>
  );
}

function ChevronMark({ open, className = "size-3.5" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function CheckMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

