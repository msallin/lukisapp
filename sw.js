/**
 * Service worker for Lukis. Caches the app shell and the Firebase SDK so the app
 * loads with no network. Firestore's own API calls are left alone -- the SDK has
 * its own offline cache and queue, so the worker must not intercept them.
 * Bump CACHE whenever you change a precached file, so clients pick up the update.
 */

"use strict";

const CACHE = "lukis-v4";
const RUNTIME = "lukis-runtime"; // Firebase SDK modules, cached on first use
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App shell: cache-first, falling back to the cached shell for navigations.
    event.respondWith(cacheFirst(req, CACHE, req.mode === "navigate"));
  } else if (url.host === "www.gstatic.com" && url.pathname.includes("/firebasejs/")) {
    // Firebase SDK modules: cache-first so the app loads offline after first use.
    event.respondWith(cacheFirst(req, RUNTIME, false));
  }
  // Everything else (Firestore/Identity APIs) is left to the network and the
  // Firebase SDK's own offline handling.
});

async function cacheFirst(req, cacheName, navigationFallback) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    if (navigationFallback) {
      const shell = await caches.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}
