"use client";

import { useEffect, useState } from "react";

/**
 * «ثبّت التطبيق» — the button that installs AgriZed onto the phone's home screen (owner, 2026-10-03: «add an
 * install pwa button on the android users … in the landing page»).
 *
 * IT DRAWS NOTHING UNTIL THE BROWSER SAYS IT CAN. Chrome fires `beforeinstallprompt` only when the site is
 * actually installable — a manifest with the right icons, served over HTTPS, and a registered service worker
 * with a fetch handler (public/sw.js) — and only when this phone has not installed it already. So the button
 * is its own answer to «which users?»: it appears for the Android visitors who can install, and for nobody
 * else. iOS never fires it (Safari installs through its own Share menu), so no iPhone is shown a button that
 * would do nothing when tapped. Nothing here sniffs a user agent to decide that; the browser decides.
 *
 * `preventDefault()` on that event is what stops Chrome's own mini-infobar, and it is also what hands us the
 * event to keep. THE EVENT IS SINGLE USE: once `prompt()` has been called the browser will not accept it
 * again, so it is dropped afterwards whatever the visitor answered. Declining and wanting it later is a page
 * reload away, and a button that silently stops working on the second press is worse than no button.
 *
 * The words arrive as props, already read from `settings` on the server, like every other string on this page.
 */

/** The non-standard event Chromium fires. It is not in lib.dom, so its two members are named here. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp({ title, note, cta }: { title: string; note: string; cta: string }) {
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallPromptEvent);
    };
    // Installed from this very page: the card has to go without a reload, or it sits there inviting the
    // visitor to do again what they just did.
    const done = () => setOffer(null);

    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", keep);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  if (!offer) return null;

  const install = async () => {
    setBusy(true);
    try {
      await offer.prompt();
      await offer.userChoice;
    } catch (error) {
      console.error("install prompt failed", error);
    } finally {
      setOffer(null);
      setBusy(false);
    }
  };

  return (
    <section className="card mt-4 flex items-center gap-3 p-3 md:mt-8 md:gap-5 md:p-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-leaf-soft md:size-14">
        <PhoneGlyph className="size-5 text-forest md:size-7" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-semibold leading-tight text-ink md:text-xl">{title}</p>
        <p className="mt-0.5 text-[0.625rem] leading-[1.5] text-muted md:mt-1.5 md:text-sm">{note}</p>
      </div>
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className="btn btn-primary btn-sm shrink-0 md:btn-md disabled:opacity-60"
      >
        {cta}
      </button>
    </section>
  );
}

/** A phone with an arrow coming down into it: installing, drawn rather than named. */
function PhoneGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className={className}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.6" strokeLinejoin="round" />
      <path d="M12 7.5v6.5m0 0 2.4-2.4M12 14l-2.4-2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.4 18.4h3.2" strokeLinecap="round" />
    </svg>
  );
}
