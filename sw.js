'use strict';
// バージョンを上げるとキャッシュが更新されます
const CACHE = 'gotta-gaccha-v1';
const CORE = ['./', 'index.html', 'script.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const TAILWIND = 'https://cdn.tailwindcss.com';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // Tailwind CDN はオフラインでも画面が崩れないよう、可能なら事前キャッシュ
    try { await c.add(new Request(TAILWIND, { mode: 'no-cors' })); } catch {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Stale-while-revalidate: キャッシュを即返し、裏で最新版に更新
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  })());
});
