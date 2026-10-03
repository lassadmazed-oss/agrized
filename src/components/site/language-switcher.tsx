"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { rememberLanguage } from "@/app/[lang]/(public)/language-actions";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE, LOCALE_DIR, localePath, splitLocale, type Locale } from "@/lib/i18n/locales";

export type LanguageChoice = { code: Locale; name: string };

/**
 * The language selector (owner, 2026-10-03: «Language Selector واضح في الموقع»).
 *
 * EVERY CHOICE IS A REAL LINK to the same page in that language — /fr/projects, /projects for Arabic (through
 * /ar/…, which the proxy turns into «remember Arabic» and the one Arabic address). So it works with no
 * JavaScript, a search engine can follow it, and opening one in a new tab does the obvious thing. The proxy
 * remembers the language from the address alone (src/proxy.ts).
 *
 * WHAT THE CLICK ADDS on top of the link: the cookie is written before leaving, so the very next request is
 * already in the new language, and — for a signed-in client — the choice is saved on their file
 * (persons.preferred_locale), which is what every SMS after that is written in. The save is awaited but
 * bounded: a slow network never holds the visitor on the old page for more than a moment.
 *
 * A FULL PAGE LOAD, deliberately (not router.push): the whole document changes direction between Arabic and
 * the others, and `<html dir>` belongs to the first byte, not to a client-side patch.
 *
 * `variant="menu"` is the header's compact button with a list under it; `variant="list"` is a plain row of
 * links (the footer); `variant="pills"` is a row of large chips for a phone, which has no header to hold the menu.
 */
export function LanguageSwitcher({
  choices,
  variant = "menu",
  className = "",
}: {
  choices: LanguageChoice[];
  variant?: "menu" | "list" | "pills";
  className?: string;
}) {
  const locale = useLocale();
  const t = useT();
  const pathname = usePathname() ?? "/";
  // Where the open list sits, in viewport pixels. It is `fixed` rather than `absolute` because the header card
  // that holds the button clips its overflow (that is how it keeps its rounded corners), and a list drawn
  // inside it would be cut off at the card's edge.
  const [open, setOpen] = useState<{ top: number; inlineEnd: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The page's own path without its language: /fr/projects → /projects.
  const bare = splitLocale(pathname).path;
  const hrefFor = (code: Locale) => (code === "ar" ? `/ar${bare === "/" ? "" : bare}` : localePath(code, bare));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    // The list is pinned to the screen where the button was; once the page moves under it, it would float
    // away from its button, so a scroll closes it.
    const onScroll = () => setOpen(null);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  if (choices.length < 2) return null;

  const choose = async (event: React.MouseEvent<HTMLAnchorElement>, code: Locale) => {
    // A modified click (new tab, new window) is the browser's business.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    writeLocaleCookie(code);
    // Only a visitor with a Supabase session can be a signed-in client; nobody else pays for the round trip.
    if (document.cookie.includes("sb-")) {
      await Promise.race([rememberLanguage(code).catch(() => null), new Promise((resolve) => setTimeout(resolve, 1500))]);
    }
    const { origin, search, hash } = window.location;
    window.location.assign(new URL(`${hrefFor(code)}${search}${hash}`, origin).toString());
  };

  const items = choices.map((choice) => (
    <a
      key={choice.code}
      href={hrefFor(choice.code)}
      hrefLang={choice.code}
      lang={choice.code}
      dir={LOCALE_DIR[choice.code]}
      aria-current={choice.code === locale ? "true" : undefined}
      onClick={(event) => void choose(event, choice.code)}
      className={
        variant === "menu"
          ? "flex min-h-11 items-center justify-between gap-cozy rounded-xl px-3 text-sm text-ink hover:bg-leaf-soft aria-[current]:font-semibold aria-[current]:text-forest"
          : variant === "pills"
            ? "chip min-h-11 px-4 text-sm font-medium aria-[current]:border-forest aria-[current]:bg-forest aria-[current]:text-paper"
            : "py-1 underline-offset-4 hover:underline aria-[current]:font-semibold aria-[current]:no-underline"
      }
    >
      <span>{choice.name}</span>
      {variant === "menu" ? (
        <span className="text-xs uppercase tracking-wide text-muted" aria-hidden="true">
          {choice.code}
        </span>
      ) : null}
    </a>
  ));

  if (variant === "list" || variant === "pills") {
    return (
      <nav aria-label={t("ui.common.language")} className={`flex flex-wrap items-center gap-x-cozy gap-y-tight ${className}`.trim()}>
        {items}
      </nav>
    );
  }

  const current = choices.find((choice) => choice.code === locale) ?? choices[0];

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        aria-expanded={open !== null}
        aria-controls={menuId}
        aria-label={`${t("ui.common.choose_language")} — ${current.name}`}
        title={t("ui.common.choose_language")}
        onClick={(event) => {
          if (open) return setOpen(null);
          const rect = event.currentTarget.getBoundingClientRect();
          const rtl = document.documentElement.dir === "rtl";
          setOpen({ top: rect.bottom + 8, inlineEnd: rtl ? rect.left : window.innerWidth - rect.right });
        }}
        className="inline-flex size-12 items-center justify-center gap-1 rounded-[1.25rem] border border-line bg-surface text-forest transition-colors hover:border-forest/30 hover:bg-leaf-soft max-md:size-10 max-md:rounded-xl lg:size-14"
      >
        <GlobeMark className="size-5 lg:size-6" />
        <span className="sr-only">{current.name}</span>
        <span aria-hidden="true" className="text-[0.625rem] font-bold uppercase leading-none">
          {current.code}
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          style={{ top: open.top, insetInlineEnd: open.inlineEnd }}
          className="fixed z-50 w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-muted">{t("ui.common.language")}</p>
          {items}
        </div>
      ) : null}
    </div>
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
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.75" />
      <path d="M3.5 12h17" />
      <path d="M12 3.25c2.4 2.5 3.6 5.4 3.6 8.75s-1.2 6.25-3.6 8.75c-2.4-2.5-3.6-5.4-3.6-8.75S9.6 5.75 12 3.25Z" />
    </svg>
  );
}
