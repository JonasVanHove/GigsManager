/**
 * Simple in-memory cache for API responses to reduce database load.
 * TTL: 30 seconds for gigs, 60 seconds for settings
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<any>>();

export function setCacheEntry<T>(key: string, data: T, ttlSeconds = 30) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlSeconds * 1000,
  });
}

export function getCacheEntry<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

export function invalidateCache(pattern?: string) {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  const keysToDelete = Array.from(cache.keys()).filter(key =>
    key.includes(pattern)
  );
  
  keysToDelete.forEach(key => cache.delete(key));
}

export function getCacheKey(userId: string, resource: string, params?: Record<string, any>) {
  const paramStr = params ? Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&') : '';
  return `${userId}:${resource}${paramStr ? `:${paramStr}` : ''}`;
}
