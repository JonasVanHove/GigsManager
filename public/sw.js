// Service Worker for GigsManager
// Provides offline support and intelligent caching strategies

const CACHE_NAME = 'gigs-manager-v1.10.3';
const STATIC_CACHE = 'gigs-manager-static-v1';
const DYNAMIC_CACHE = 'gigs-manager-dynamic-v1';
const LONG_TERM_CACHE = 'gigs-manager-longterm-v1';

// Static assets that should be cached on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/browserconfig.xml',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== STATIC_CACHE &&
            cacheName !== DYNAMIC_CACHE &&
            cacheName !== LONG_TERM_CACHE
          ) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { destination, method, url } = request;

  // Only cache GET requests
  if (method !== 'GET') {
    return;
  }

  // Skip chrome extensions and non-http protocols
  if (!url.startsWith('http')) {
    return;
  }

  // Strategy 1: Icons and static assets - cache first, long-term
  if (
    url.includes('/favicon') ||
    url.includes('/icon-') ||
    url.includes('/apple-touch-icon') ||
    url.includes('/browserconfig')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.ok && destination === 'image') {
            const cloned = response.clone();
            caches.open(LONG_TERM_CACHE).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 2: Images - cache first with fallback
  if (destination === 'image') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const cloned = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, cloned);
            });
            return response;
          })
          .catch(() => {
            // Return a placeholder or cached version if available
            return caches.match(request).catch(() => {
              return new Response('Image not available offline', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain',
                }),
              });
            });
          });
      })
    );
    return;
  }

  // Strategy 3: API calls - network first with cache fallback
  if (url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const cloned = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, cloned);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ error: 'Offline - cached data unavailable' }),
              {
                status: 503,
                headers: new Headers({
                  'Content-Type': 'application/json',
                }),
              }
            );
          });
        })
    );
    return;
  }

  // Strategy 4: HTML/JS/CSS - network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cloned);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page or error
          return caches.match('/').catch(() => {
            return new Response('Offline - page not available', {
              status: 503,
              statusText: 'Service Unavailable',
            });
          });
        });
      })
  );
});

// Message handler for cache clearing
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        caches.delete(cacheName);
      });
    });
  }
});

console.log('Service Worker script loaded');
