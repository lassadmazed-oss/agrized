"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * «شنوّة يصير؟» — the answer, for the half-second the site is fetching the next screen.
 *
 * Owner, 2026-09-23: when something is clicked, a circle in the middle of the screen and the page behind it
 * blurred, so it is plain that the tap landed and something is coming.
 *
 * WHY A LISTENER AND NOT A ROUTER EVENT. The App Router publishes no navigation events; the documented ways
 * to show progress are `loading.js`, which is per route segment and replaces the screen rather than covering
 * it, and `useLinkStatus`, which only reads the pending state of the ONE link it is rendered inside. Neither
 * gives a single veil over the whole site. So this listens to the click itself, in the capture phase, before
 * the router has decided anything — the veil is up on the same frame the finger lands.
 *
 * WHY IT WAITS 90ms FIRST. Most navigations here are prefetched and arrive in well under that, and a veil
 * that flashes for 80ms reads as a glitch, not as progress. The delay is the debounce the Next documentation
 * itself recommends for pending-link hints: nothing is shown unless the wait is long enough to be felt. The
 * veil then fades in rather than appearing, for the same reason.
 *
 * WHAT COUNTS AS «something was clicked»:
 *   · a link inside this site — not an anchor to another origin, not `target="_blank"`, not a download, not
 *     a bare `#hash` on the page we are already on, and not a ctrl/cmd/middle click, because all of those
 *     either leave the site or open a second tab and this tab is not going anywhere;
 * A FORM SUBMIT IS NOT A NAVIGATION, and this used to treat it as one. A Server Action that answers by
 * RETURNING — a wrong password, a field that failed validation, anything that re-renders the same screen —
 * never changes the address, so the veil went up and had nothing to bring it down: the Back Office login
 * blurred itself out on the first typo and stayed that way (owner, 2026-09-23). Those screens already say
 * they are working, each in its own button («جارٍ الدخول…»), which is feedback that knows when it is done.
 * The veil is for leaving a screen.
 *
 * HOW IT COMES DOWN. `usePathname` and `useSearchParams` both change the moment the new screen is committed,
 * so the effect that watches them lowers the veil. `pagehide` covers the case where the click left the site
 * altogether and the browser is showing us again from its back-forward cache.
 */
export function NavigationVeil() {
  const pathname = usePathname();
  const search = useSearchParams();

  /*
   * The veil is DERIVED from the address, not lowered by an effect.
   *
   * What is remembered is the screen the click happened on. While the address still reads that screen the
   * navigation is unfinished and the veil is up; the moment the router commits the next one the address
   * differs and the same expression is false. Nothing has to watch for the arrival and set a flag — the
   * arrival IS the flag, which is also why this holds when the router restores a screen from history.
   */
  const here = `${pathname}?${search.toString()}`;
  const [leftFrom, setLeftFrom] = useState<string | null>(null);
  const pending = leftFrom !== null && leftFrom === here;

  useEffect(() => {
    let timer: number | undefined;

    const raise = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const q = window.location.search.replace(/^\?/, "");
        setLeftFrom(`${window.location.pathname}?${q}`);
      }, 90);
    };

    const onClick = (event: MouseEvent) => {
      // A modified click is a request for a second tab, and this one stays where it is.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same screen, different anchor: nothing is being fetched.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      raise();
    };

    const onLeave = () => {
      window.clearTimeout(timer);
      setLeftFrom(null);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  /*
   * The backstop.
   *
   * Everything above lowers the veil by ARRIVING somewhere, which is right when a navigation finishes and
   * useless when one never does: a route that throws, a prefetch that dies on a dropped connection, a tap
   * on a link to the screen the router is already on. A cover over the whole site cannot be left to depend
   * on the happy path alone, so it also comes down on its own after five seconds — long enough that no real
   * navigation is cut short, short enough that nobody sits and watches it.
   */
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setLeftFrom(null), 5000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="nav-progress" role="status" aria-live="polite">
      {/* One element, one composited animation. The bar is the whole hint: no sheet over the page, no blur
          sampling the screen behind it on the frame the router is busiest. */}
      <span aria-hidden="true" />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}
