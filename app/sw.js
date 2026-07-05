// ============================================================
// 山 Shan — service worker. Cache-first app shell so the PWA
// opens with no signal in the gym. __V__ is stamped to the
// commit SHA by the deploy workflow; a new version installs a
// fresh cache and deletes stale ones on activate.
// ============================================================
const CACHE = "shan-__V__";
const SHELL = [
  "./",
  "index.html",
  "config.js?v=__V__",
  "manifest.webmanifest",
  "assets/styles.css?v=__V__",
  "assets/app.js?v=__V__",
  "assets/program.js?v=__V__",
  "assets/ranks.js?v=__V__",
  "assets/fonts/CormorantGaramond.woff2",
  "assets/fonts/Spectral-300.woff2",
  "assets/fonts/Spectral-400.woff2",
  "assets/fonts/Spectral-400i.woff2",
  "assets/fonts/Spectral-500.woff2",
  "assets/fonts/IBMPlexMono-400.woff2",
  "assets/fonts/IBMPlexMono-500.woff2",
  "assets/icon-192.png",
  "assets/icon-512.png",
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", e=>{
  const url = new URL(e.request.url);
  // Supabase (and any other cross-origin request) always goes to the network
  if(e.request.method!=="GET" || url.origin!==location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit=> hit ||
      fetch(e.request).then(res=>{
        if(res.ok){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
        return res;
      }).catch(()=> e.request.mode==="navigate" ? caches.match("index.html") : Response.error())
    )
  );
});
