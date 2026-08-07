const CACHE_NAME = 'persona-ai-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './PersonaAI_Icon_512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// התקנת ה-Service Worker ושמירת הקבצים
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// ניקוי מוחלט של זיכרון ה-404 הישן
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// מענה לבקשות רשת - עדיפות לרשת כדי תמיד לקבל עדכונים, ואז גיבוי מקאש
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
