const prefix = "klao-work-preview-";
const cacheName = prefix + "1";
const files = ["./", "./index.html", "./style.css", "./app.js"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(files)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith(prefix) && name !== cacheName)
    .map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const assets = files.map((file) => new URL(file, self.registration.scope).href);
  if (event.request.mode === "navigate" && assets.slice(0, 2).includes(event.request.url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html", { cacheName })));
  } else if (assets.includes(event.request.url)) {
    event.respondWith(caches.match(event.request, { cacheName }).then((cached) => cached || fetch(event.request)));
  }
});
