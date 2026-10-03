"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, once, after the page has settled.
 *
 * It is here for one reason: without a registered worker carrying a fetch handler, Chrome on Android never
 * fires `beforeinstallprompt`, and the install button (src/components/site/install-app.tsx) can never appear.
 * The worker itself says what it does and, more importantly, what it deliberately does not cache.
 *
 * NOT IN DEVELOPMENT. A worker sitting in front of `next dev` interferes with hot reloading, and — worse — it
 * outlives the session: a worker registered against localhost stays registered against localhost, so the next
 * project served on the same port inherits it. Production only.
 *
 * It waits for `load`. Registering during the first paint makes the browser fetch and start the worker while it
 * is still laying out the page the visitor is waiting for; nothing here is needed in that first second.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration costs the install button and nothing else, so it must never take a page with
        // it: an unhandled rejection here would surface as an error on a page that is working perfectly.
        console.error("service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
