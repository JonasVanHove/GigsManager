// Service Worker for GigsManager
// Provides offline support and intelligent caching strategies

const CACHE_NAME = 'gigs-manager-v1.28.27';
const STATIC_CACHE = 'gigs-manager-static-v3';
const DYNAMIC_CACHE = 'gigs-manager-dynamic-v3';
const LONG_TERM_CACHE = 'gigs-manager-longterm-v3';
// Repertoire API responses (stale-while-revalidate, token-scoped keys).
const REPERTOIRE_CACHE = 'gigs-manager-repertoire-v1';
// Explicitly pinned attachment assets ("Offline Opslaan").
const OFFLINE_CACHE = 'gigs-manager-offline-v1';

/**
 * Builds a cache-key request scoped to the authorization token. Repertoire
 * API responses are user-specific; scoping by a fingerprint of the bearer
 * token prevents cached repertoire of one account being served to another
 * account on a shared device.
 */
function authScopedKey(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth) return request;
  let hash = 0;
  for (let i = 0; i < auth.length; i += 1) {
    hash = (hash * 31 + auth.charCodeAt(i)) | 0;
  }
  const keyUrl = `${request.url}${request.url.includes('?') ? '&' : '?'}_swauth=${(hash >>> 0).toString(36)}`;
  return new Request(keyUrl);
}


// Static assets that should be cached on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/browserconfig.xml',
];

// Install event - cache static assets
// Assets are cached individually with per-item error handling so that a single
// failure (offline, quota, aborted hard refresh) can never fail installation
// and leave the new worker stuck.
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        console.log('Caching static assets');
        await Promise.all(
          STATIC_ASSETS.map(async (asset) => {
            try {
              await cache.add(asset);
            } catch (err) {
              console.warn('SW: failed to cache static asset during install:', asset, err);
            }
          })
        );
      } catch (err) {
        console.warn('SW: install caching skipped:', err);
      }
    })()
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
            cacheName !== LONG_TERM_CACHE &&
            cacheName !== REPERTOIRE_CACHE &&
            cacheName !== OFFLINE_CACHE
          ) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).catch((err) => {
      console.warn('SW: cache cleanup failed:', err);
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

  // Never intercept Next.js build assets or app documents.
  // Caching these is what causes stale chunk URLs and MIME/404 failures after deploys.
  if (
    destination === 'document' ||
    destination === 'script' ||
    destination === 'style' ||
    url.includes('/_next/')
  ) {
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
      caches
        .match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((response) => {
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              const cloned = response.clone();
              caches
                .open(DYNAMIC_CACHE)
                .then((cache) => cache.put(request, cloned))
                .catch(() => {});
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
        .catch(() => {
          // A Cache API failure must never block or break the request -
          // fall back to the network and degrade gracefully.
          return fetch(request).catch(() => new Response('', {
            status: 503,
            statusText: 'Service Unavailable',
          }));
        })
    );
    return;
  }

  // Strategy 3a: Repertoire APIs (songs & setlists) - stale-while-revalidate.
  // Serve the cached copy instantly (gig-critical: must never block on the
  // network) and refresh it in the background. Cache keys are scoped to the
  // bearer token so multi-account devices never share repertoire data.
  if (url.includes('/api/songs') || url.includes('/api/setlists')) {
    event.respondWith(
      (async () => {
        const key = authScopedKey(request);
        const cache = await caches.open(REPERTOIRE_CACHE).catch(() => null);
        const cached = cache
          ? await caches.match(key, { ignoreVary: true }).catch(() => undefined)
          : undefined;

        const networkFetch = fetch(request)
          .then(async (response) => {
            if (response && response.status === 200 && cache) {
              try {
                await cache.put(key, response.clone());
              } catch (err) {
                console.warn('SW: repertoire cache.put failed:', err);
              }
            }
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(networkFetch.catch(() => undefined));
          return cached;
        }

        const response = await networkFetch;
        if (response) return response;
        return new Response(
          JSON.stringify({ error: 'Offline and no cached repertoire data.', type: 'offline_no_cache' }),
          { status: 503, headers: new Headers({ 'Content-Type': 'application/json' }) },
        );
      })()
    );
    return;
  }

  // Strategy 3: API calls - network first with intelligent fallback
  // Skip API interception on local dev hosts: SW fetch failures surface as false
  // "Offline - cached data unavailable" while Next.js dev / DB are actually up.
  if (url.includes('/api/')) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return;
      }
    } catch {
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          const contentType = response.headers.get('content-type') || '';
          const isHtmlResponse = contentType.includes('text/html');

          // API routes should not return HTML error pages to app fetchers.
          // Convert them into JSON so the client can handle gracefully.
          if (isHtmlResponse) {
            return new Response(
              JSON.stringify({
                error: 'Service temporarily unavailable',
                type: 'unexpected_html_response',
              }),
              {
                status: response.status >= 400 ? response.status : 503,
                headers: new Headers({
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store',
                }),
              }
            );
          }

          // Cache successful responses
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches
              .open(DYNAMIC_CACHE)
              .then((cache) => cache.put(request, cloned))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => {
          // Network error - try cached response first
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // No cache available - return appropriate error
            const errorMsg = 'Unable to load data. Please check your connection and try again.';
            return new Response(
              JSON.stringify({ error: errorMsg }),
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

  // Strategy 3b: Media (audio backing tracks / demos) - cache first.
  // Backing-track files are immutable uploads, so once a setlist is pinned
  // ("Offline Opslaan") the cached copy in gigs-manager-offline-v1 serves
  // instantly — even mid-gig with zero connectivity — and only falls back
  // to the network when never cached before.
  if (destination === 'audio' || destination === 'video') {
    event.respondWith(
      (async () => {
        try {
          const offlineCache = await caches.open(OFFLINE_CACHE);
          const pinned = await offlineCache.match(request, { ignoreVary: true }).catch(() => undefined);
          if (pinned) return pinned;
        } catch (err) {
          console.warn('SW: offline cache lookup failed:', err);
        }
        try {
          const network = await fetch(request);
          if (network && (network.ok || network.type === 'opaque')) {
            const cache = await caches.open(OFFLINE_CACHE).catch(() => null);
            if (cache) await cache.put(request, network.clone()).catch(() => {});
          }
          return network;
        } catch (err) {
          // Offline and not pinned: try the runtime cache, then fail softly.
          const anyCached =
            (await caches.match(request, { ignoreVary: true }).catch(() => undefined)) ||
            (await caches.match(request, { ignoreVary: true, cacheName: OFFLINE_CACHE }).catch(() => undefined));
          return (
            anyCached ||
            new Response('Offline - audio not available', {
              status: 503,
              statusText: 'Service Unavailable',
            })
          );
        }
      })()
    );
    return;
  }

  // Strategy 4: Other assets - network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const cloned = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, cloned))
          .catch(() => {});
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
// Errors are caught and logged so cache revalidation problems can never throw
// inside (and stall) the worker's event loop.
self.addEventListener('message', (event) => {
  try {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
    if (event.data && event.data.type === 'PIN_URLS' && Array.isArray(event.data.urls)) {
      const urls = event.data.urls
        .filter((u) => typeof u === 'string' && u.startsWith('http'))
        .slice(0, 400);
      caches
        .open(OFFLINE_CACHE)
        .then((cache) =>
          Promise.all(
            urls.map(async (u) => {
              try {
                const hit = await cache.match(u);
                if (hit) return;
                // no-cors keeps cross-origin attachment storage fetchable; an
                // opaque response is still replayable for <img>/<a> tags.
                const res = await fetch(u, { mode: 'no-cors' });
                if (res && (res.ok || res.type === 'opaque')) {
                  await cache.put(u, res).catch(() => {});
                }
              } catch (err) {
                console.warn('SW: failed to pin URL:', u, err);
              }
            }),
          ),
        )
        .then(() => {
          if (event.source) {
            event.source.postMessage({ type: 'URLS_PINNED', count: urls.length });
          }
        })
        .catch((err) => console.warn('SW: PIN_URLS failed:', err));
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
      caches
        .keys()
        .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
        .catch((err) => console.warn('SW: failed to clear caches:', err))
        .finally(() => {
          if (event.source) {
            event.source.postMessage({ type: 'CACHE_CLEARED' });
          }
        });
    }
  } catch (err) {
    console.warn('SW: message handler error:', err);
  }
});

console.log('Service Worker script loaded');
