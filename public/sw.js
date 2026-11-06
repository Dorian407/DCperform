// Service worker : met l'interface en cache pour qu'elle s'ouvre vite.
// Les données (Supabase) ne sont jamais mises en cache.
const VERSION = 'dc-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/js/app.js', '/js/api.js', '/js/util.js', '/js/config.js', '/vendor/supabase-2.117.3.js', '/logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord, cache si hors ligne : les mises à jour arrivent tout de suite.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
