"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Wordmark } from "@/components/brand/wordmark";

export type HeaderLink = { href: string; label: string };

type HeaderBarProps = {
  tagline: string;
  links: HeaderLink[];
  cta: HeaderLink | null;
};

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/**
 * The site bar. On the home page it floats in white over the hero photograph, as on the design board,
 * and settles on paper once the visitor scrolls. Every other page gets the paper bar and a spacer.
 */
export function HeaderBar({ tagline, links, cta }: HeaderBarProps) {
  const overHero = usePathname() === "/";
  const scrolled = useSyncExternalStore(subscribeToScroll, () => window.scrollY > 24, () => false);
  const solid = !overHero || scrolled;

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
          solid
            ? "border-line/80 bg-paper/92 shadow-[0_10px_30px_-24px_rgba(22,29,23,0.45)] backdrop-blur-md"
            : "border-transparent bg-linear-to-b from-black/40 to-transparent"
        }`}
      >
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="AgriZed، الصفحة الرئيسية" className="flex shrink-0 items-center gap-4 rounded-md">
            <Wordmark onDark={!solid} className="text-[2rem]" />
            {tagline ? (
              <span
                className={`hidden max-w-44 border-s ps-4 text-[0.8rem] leading-5 xl:block ${
                  solid ? "border-line-strong text-muted" : "border-white/40 text-white/85"
                }`}
              >
                {tagline}
              </span>
            ) : null}
          </Link>

          <nav aria-label="أقسام الموقع" className="hidden flex-1 justify-center md:flex">
            <ul className="flex items-center gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`rounded-md px-3.5 py-2 text-[0.95rem] font-medium transition-colors ${
                      solid ? "text-ink/75 hover:bg-leaf-soft hover:text-forest" : "text-white/90 hover:bg-white/12 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Always reachable while scrolling; on a phone the fixed bar at the bottom takes over. */}
          {cta ? (
            <Link href={cta.href} className="btn btn-primary ms-auto hidden min-h-11 px-5 text-[0.95rem] md:ms-0 md:inline-flex">
              {cta.label}
            </Link>
          ) : null}
        </div>
      </header>
      {overHero ? null : <div aria-hidden="true" className="h-18" />}
    </>
  );
}
