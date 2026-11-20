const prefix = "klao-work-preview-";
const revision = "11";
const cacheName = prefix + revision;
const scope = self.registration.scope;
const home = new URL("./", scope);
const index = new URL("./index.html", scope);
const assets = [
  "style.css?v=" + revision,
  "app.js?v=" + revision,
  "data.js?v=" + revision,
  "vendor/jszip.min.js?v=" + revision,
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
].map((file) => new URL(file, scope).href);

self.addEventListener("install", (event) => {
  const requests = [home.href, ...assets].map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(cacheName)
    .then((cache) => cache.addAll(requests))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names
      .filter((name) => name.startsWith(prefix) && name !== cacheName)
      .map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

async function fetchWithOfflineCopy(url, request) {
  let response;
  try {
    response = await fetch(request, { cache: "no-cache" });
  } catch (error) {
    const stored = await caches.match(url, { cacheName });
    if (stored) return stored;
    throw error;
  }

  if (response.ok && !response.redirected) {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(url, response.clone());
    } catch (error) {
      console.info("Could not update offline copy:", error.name);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === home.origin
      && (url.pathname === home.pathname || url.pathname === index.pathname)) {
    event.respondWith(fetchWithOfflineCopy(home.href, request));
  } else if (assets.includes(url.href)) {
    event.respondWith(fetchWithOfflineCopy(url.href, request));
  }
});
