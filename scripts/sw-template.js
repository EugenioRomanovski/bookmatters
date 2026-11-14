/* Generated at build time. Only the public app shell is stored offline. */
const CACHE_PREFIX = "bookmatters-shell-";
const CACHE_NAME = CACHE_PREFIX + "__VERSION__";
const PRECACHE_URLS = __PRECACHE__;
const STATIC_PATHS = new Set(PRECACHE_URLS);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  // Let a new version wait until old tabs close, preserving unsent drafts.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache API calls, authentication, or personal records.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match("/index.html", { cacheName: CACHE_NAME })) || Response.error();
      }
    })());
    return;
  }
  if (!STATIC_PATHS.has(url.pathname) || url.search) return;
  event.respondWith((async () => {
    return (await caches.match(request, { cacheName: CACHE_NAME })) || fetch(request);
  })());
});
