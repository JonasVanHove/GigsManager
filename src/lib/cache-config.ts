// Performance and caching configuration utilities
// Used throughout the app for consistent caching strategies

export const DEFAULT_CACHE_HEADERS = {
  // Immutable assets (fingerprinted by Next.js)
  immutable: 'public, max-age=31536000, immutable',

  // Long-term cache (1 day)
  longTerm: 'public, max-age=86400',

  // Medium-term cache (1 hour)
  mediumTerm: 'public, max-age=3600, s-maxage=3600',

  // Short-term cache (5 minutes)
  shortTerm: 'public, max-age=300',

  // No cache - always revalidate
  noCache: 'public, max-age=0, must-revalidate',

  // Stale while revalidate (update in background)
  staleWhileRevalidate: 'public, max-age=3600, stale-while-revalidate=86400',
} as const;

type CacheType = keyof typeof DEFAULT_CACHE_HEADERS;

// Helper function to set cache headers in API routes
export function setCacheHeaders(response: Response, cacheType: CacheType = 'mediumTerm'): Response {
  response.headers.set('Cache-Control', DEFAULT_CACHE_HEADERS[cacheType]);
  response.headers.set('Content-Type', 'application/json');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

// Compression utility for large responses
export function createJsonResponse(
  data: unknown,
  cacheType: CacheType = 'mediumTerm',
  status: number = 200
): Response {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': DEFAULT_CACHE_HEADERS[cacheType],
    },
  });
  return response;
}

// Error response with appropriate caching
export function createErrorResponse(
  error: Error | string,
  status: number = 500,
  cacheType: CacheType = 'shortTerm'
): Response {
  return createJsonResponse(
    { error: error instanceof Error ? error.message : String(error) },
    cacheType,
    status
  );
}

// Revalidate config for Next.js pages
export const REVALIDATE_TIMES = {
  // Static generation with on-demand revalidation
  static: false,
  // Revalidate every 60 seconds
  frequent: 60,
  // Revalidate every 5 minutes
  normal: 300,
  // Revalidate every 1 hour
  infrequent: 3600,
  // Revalidate every 24 hours
  daily: 86400,
} as const;
