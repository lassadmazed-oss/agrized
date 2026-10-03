// The smallest service worker that does something true.
//
// WHY IT EXISTS AT ALL. Chrome on Android only offers «install» — and only fires `beforeinstallprompt`, which
// is what src/components/site/install-app.tsx waits for — when the site has a registered service worker with a
// fetch handler. Without this file the install button could never appear, whatever the manifest says.
//
// WHY IT CACHES ALMOST NOTHING. The usual service worker caches the app shell: HTML, JavaScript, CSS. On a site
// that deploys several times a day that is how you serve a page from last week to someone who has no idea they
// are holding one and no obvious way to clear it. So: one offline page, kept for the single case where it is the
// only thing that can help, and every other request goes straight to the network as if this file did not exist.
//
// Real offline support is a separate decision, not something to bolt onto an install button.

const CACHE = "agrized-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `cache: "reload"` so the offline page is taken from the network, never from an HTTP cache that may
      // still hold the copy a previous version of this worker stored.
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      // Take over the open pages now, so a worker left by an older version of the site stops answering for it.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only whole-page loads. Everything else — the data the pages fetch as you move around them, the pictures,
  // the fonts — is left entirely alone: no respondWith, so the browser does exactly what it would normally do.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE);
      // If even the offline page is missing there is nothing honest left to show, so let the browser say so
      // in its own words rather than inventing a page here.
      return cached ?? Response.error();
    }),
  );
});
