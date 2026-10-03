"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

import { rememberLanguage } from "@/app/[lang]/(public)/language-actions";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE, LOCALE_DIR, localePath, splitLocale, type Locale } from "@/lib/i18n/locales";

export type LanguageChoice = { code: Locale; name: string };

type Variant = "header" | "hero" | "row" | "list";

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
 * FOUR FACES, ONE LIST.
 *   header  the bar's control: the globe, the language's code (its full name from xl), a chevron. On a wide
 *           screen it opens a dropdown under itself; on a phone, a sheet.
 *   hero    the phone home's glass chip on the photograph — translucent, blurred, white type, so it belongs
 *           to the picture instead of sitting on it like a sticker (owner: «the button … is messed up»).
 *   row     a settings row for the phone's account tab: «اللغة» and the current one, opening the sheet.
 *   list    plain links, for the footer's small print.
 *
 * THE PHONE GETS A SHEET, not a dropdown: a thumb reaches the bottom of the screen, five rows of 56px are
 * easy targets, and it is the shape the assistant already uses on this site. Both panels are drawn in a portal
 * on <body>, because the bar and the hero clip their overflow (that is how they keep their rounded corners).
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
  const [panel, setPanel] = useState<
    { kind: "sheet" } | { kind: "dropdown"; top: number; inlineEnd: number } | null
  >(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  // The page's own path without its language: /fr/projects → /projects.
  const bare = splitLocale(pathname).path;
  const hrefFor = (code: Locale) => (code === "ar" ? `/ar${bare === "/" ? "" : bare}` : localePath(code, bare));

  useEffect(() => {
    if (!panel) return;
    const trigger = triggerRef.current;
    const close = () => setPanel(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || trigger?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // A dropdown is pinned where its button was; once the page moves under it, it would float away from it.
    const onScroll = () => {
      if (panel.kind === "dropdown") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", close);

    // A sheet holds the page still beneath it, and the current language takes the focus so a keyboard or a
    // screen reader starts where the visitor is.
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    if (panel.kind === "sheet") html.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", close);
      html.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [panel]);

  if (choices.length < 2) return null;
  const current = choices.find((choice) => choice.code === locale) ?? choices[0];

  const choose = async (event: ReactMouseEvent<HTMLAnchorElement>, code: Locale) => {
    // A modified click (new tab, new window) is the browser's business.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (code === locale) {
      setPanel(null);
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

  const toggle = () => {
    if (panel) return setPanel(null);
    const wide = window.matchMedia("(min-width: 48rem)").matches;
    const trigger = triggerRef.current;
    if (variant === "header" && wide && trigger) {
      const rect = trigger.getBoundingClientRect();
      const rtl = document.documentElement.dir === "rtl";
      // clientWidth, not innerWidth: the latter counts the scrollbar, which pushed the list off the button's edge.
      setPanel({
        kind: "dropdown",
        top: rect.bottom + 10,
        inlineEnd: rtl ? rect.left : document.documentElement.clientWidth - rect.right,
      });
    } else {
      setPanel({ kind: "sheet" });
    }
  };

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
    variant === "hero" ? (
      <button
        {...common}
        aria-label={label}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border border-white/35 bg-forest-700/35 ps-2.5 pe-3 text-[0.8125rem] font-semibold text-paper shadow-[0_6px_18px_-8px_rgb(0_0_0/0.55)] backdrop-blur-md transition-colors hover:bg-forest-700/50 ${className}`.trim()}
      >
        <GlobeMark className="size-4" />
        <span aria-hidden="true" lang="en">
          {current.code.toUpperCase()}
        </span>
        <ChevronMark open={panel !== null} />
      </button>
    ) : variant === "row" ? (
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
        <span aria-hidden="true" className="text-[0.8125rem] font-bold xl:hidden" lang="en">
          {current.code.toUpperCase()}
        </span>
        <span aria-hidden="true" className="hidden text-sm font-semibold xl:inline" lang={current.code}>
          {current.name}
        </span>
        <ChevronMark open={panel !== null} className="size-3.5 opacity-70" />
      </button>
    );

  const rows = choices.map((choice) => {
    const isCurrent = choice.code === locale;
    return (
      <a
        key={choice.code}
        href={hrefFor(choice.code)}
        hrefLang={choice.code}
        aria-current={isCurrent ? "true" : undefined}
        onClick={(event) => void choose(event, choice.code)}
        className={`flex items-center gap-3 rounded-xl px-3 outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-forest/40 aria-[current]:bg-leaf-soft ${
          panel?.kind === "sheet" ? "min-h-14" : "min-h-11"
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
        <span className={`flex-1 text-start ${panel?.kind === "sheet" ? "text-base" : "text-sm"} ${isCurrent ? "font-semibold text-forest" : "text-ink"}`}>
          <span lang={choice.code} dir={LOCALE_DIR[choice.code]}>
            {choice.name}
          </span>
        </span>
        {isCurrent ? <CheckMark className="size-5 flex-none text-forest" /> : null}
      </a>
    );
  });

  const portal =
    panel && typeof document !== "undefined"
      ? createPortal(
          panel.kind === "dropdown" ? (
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-labelledby={titleId}
              style={{ top: panel.top, insetInlineEnd: panel.inlineEnd }}
              className="lang-pop fixed z-[60] w-64 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-float)]"
            >
              <p id={titleId} className="px-3 pb-2 pt-1 text-caption font-semibold text-muted">
                {t("ui.common.language")}
              </p>
              <div className="space-y-0.5">{rows}</div>
            </div>
          ) : (
            <>
              <div aria-hidden="true" className="lang-fade fixed inset-0 z-[60] bg-forest-700/45 backdrop-blur-[2px]" />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="lang-sheet fixed inset-x-0 bottom-0 z-[61] mx-auto w-full max-w-md rounded-t-[1.75rem] bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_-20px_rgb(27_42_31/0.45)]"
              >
                <span aria-hidden="true" className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-line" />
                <div className="flex items-center gap-3 px-2 pb-3 pt-1">
                  <span className="grid size-10 place-items-center rounded-full bg-leaf-soft text-forest">
                    <GlobeMark className="size-5" />
                  </span>
                  <p id={titleId} className="flex-1 text-lg font-semibold text-ink">
                    {t("ui.common.choose_language")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    aria-label={t("ui.common.close")}
                    className="grid size-10 place-items-center rounded-full text-muted hover:bg-paper"
                  >
                    <CloseMark />
                  </button>
                </div>
                <div className="space-y-1">{rows}</div>
              </div>
            </>
          ),
          document.body,
        )
      : null;

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

function CloseMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}
