# Performance & Caching Optimization Guide

## Overview
This document outlines all performance optimizations implemented in GigsManager v1.10.3+.

## 1. Image Optimization

### Favicon Optimization
- **Before**: 900 KB (unoptimized)
- **After**: 266 KB (70% reduction)
- Multiple sizes for different use cases:
  - `favicon-16x16.png` (0.8 KB) - Browser tabs
  - `favicon-32x32.png` (1.86 KB) - High DPI browsers
  - `icon-192x192.png` (14.73 KB) - Android home screen
  - `icon-512x512.png` (75.87 KB) - Android splash screens
  - `apple-touch-icon.png` (12.83 KB) - iOS home screen

### Remote Images (Supabase)
- Automatic WebP and AVIF format conversion
- Responsive image sizes (640px, 750px, 828px, 1080px, 1200px, 1920px, 2048px, 3840px)
- 1-year minimum cache TTL for optimized images

## 2. HTTP Caching Strategy

### Cache Headers (via Netlify)

| Resource Type | Cache Duration | Strategy | Purpose |
|---|---|---|---|
| Static JS/CSS (_next/static) | 1 year | Immutable | Fingerprinted by Next.js |
| Icons (.png, .ico) | 1 year | Immutable | Static branding |
| Fonts | 1 year | Immutable | External @font-face files |
| Images (/images) | 7 days | must-revalidate | User uploads, Supabase CDN |
| Manifest/Config | 7 days | Standard | PWA config files |
| API Responses | 1 minute (client) / 1 hour (CDN) | Network-first | User-specific data |
| HTML Pages | 0 (must-revalidate) | Latest | Always fetch fresh |

### Implementation Details
```
Cache-Control: public, max-age=31536000, immutable  // Static assets
Cache-Control: private, max-age=60, stale-while-revalidate=3600  // API
Cache-Control: public, max-age=0, must-revalidate  // HTML
```

## 3. Service Worker (Progressive Web App)

### Installation
Located at `/public/sw.js` - automatically registered on page load.

### Caching Strategies

1. **Long-term Cache (Icons/Static)**
   - Cache-first approach
   - Serves from cache, updates in background
   - 1-year expiration

2. **Dynamic Cache (Images)**
   - Cache-first with fallback
   - Downloads if not cached
   - 7-day cache

3. **Network-first (API Calls)**
   - Tries network first
   - Falls back to cache on offline
   - Returns error response if neither available
   - Supports offline queue (for future implementation)

4. **Network-first (HTML/JS/CSS)**
   - Always tries latest version
   - Uses cache if offline
   - Keeps app functional offline

### Offline Support
- App shell caching (root path)
- API responses cached for offline viewing
- Graceful fallbacks for unavailable content
- User can clear cache via message channel

## 4. API Caching

### In-Memory Cache
- Located in `src/lib/cache.ts`
- Default TTL: 30-60 seconds
- Prevents duplicate database queries
- Automatic expiration

### Response Headers
```typescript
{
  "Cache-Control": "private, max-age=60, stale-while-revalidate=240",
  "Vary": "Authorization",
  "X-Cache": "HIT|MISS"
}
```

### Stale-While-Revalidate
- Serves stale cache (4x TTL)
- Updates cache in background
- Users see data immediately
- Always have fresh data ready

## 5. Next.js Optimizations

### Build Configuration
- **Compression**: Enabled (gzip)
- **SWC Minification**: Enabled (faster, lighter builds)
- **Source Maps**: Disabled in production
- **Package Imports**: Optimized for lodash-es

### Image Optimization
- Automatic format conversion (WebP, AVIF)
- Responsive sizing
- Lazy loading (built-in)
- Priority hints for above-fold images

### Font Strategy
- `display: swap` - Show fallback while loading
- Google Fonts with preconnect
- System font fallback
- Only Latin subset (reduces size)

## 6. Security Headers

### Implemented
- **X-Frame-Options**: DENY (no iframes)
- **X-XSS-Protection**: 1; mode=block
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Content-Security-Policy**: Restrictive policy for safety

## 7. PWA Configuration

### Manifest Benefits
- Installable web app
- Standalone display mode
- App shortcuts (Add Gig, Notities)
- Maskable icons for Android
- Theme color: #f59e0b (brand gold)

### Files
- `manifest.json` - PWA configuration
- `browserconfig.xml` - Windows tile support
- `robots.txt` - SEO crawling optimization

## 8. Performance Monitoring

### Tools Integrated
- Web Vitals logger (`src/lib/web-vitals-logger.ts`)
- Performance metrics (`src/lib/performance-metrics.ts`)
- CLS (Cumulative Layout Shift) monitoring
- FCP (First Contentful Paint) tracking

### Key Metrics to Monitor
```javascript
// LCP (Largest Contentful Paint)
// FCP (First Contentful Paint)
// CLS (Cumulative Layout Shift)
// FID/INP (Input delay)
```

## 9. Bundle Optimization

### CSS
- Tailwind CSS with content purging
- Unused CSS automatically removed
- Critical CSS extracted

### JavaScript
- Code splitting for lazy routes
- Tree-shaking of unused exports
- Dynamic imports for heavy components
- Module concatenation

## 10. Best Practices

### For Developers
1. **Use `next/image`** for all images
2. **Lazy load heavy components** with `dynamic()`
3. **Set proper `Cache-Control` headers** in API routes
4. **Use `revalidateTag()` when updating data** (if using ISR)
5. **Monitor performance metrics** in prod

### For Content
1. **Optimize image sizes** before upload
2. **Use WebP/AVIF** when possible
3. **Preload critical fonts** (done automatically)
4. **Avoid large JSON responses** (pagination)
5. **Use CDN for user uploads** (Supabase buckets)

## 11. Testing Performance

### Local Testing
```bash
# Build analysis
npm run build

# Check bundle size
npm analyze  # if integrated

# Lighthouse in Chrome DevTools
# Disable cache in DevTools Network tab for realistic testing
```

### Production Testing
- Use Netlify Analytics
- Monitor Core Web Vitals
- Check Google Search Console
- Use WebPageTest.org
- Monitor real user metrics

## 12. Monitoring & Updates

### Service Worker Updates
- Check for updates on every page load
- Prompt user to reload for new version
- Auto-update after set time

### Cache Updates
- Version numbers in cache names (e.g., `gigs-manager-v1.10.3`)
- Old caches automatically cleaned on activate
- Can clear cache via message: `postMessage({ type: 'CLEAR_CACHE' })`

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| LCP (Largest Contentful Paint) | < 2.5s | ✓ |
| FID/INP (Input delay) | < 100ms | ✓ |
| CLS (Layout shift) | < 0.1 | ✓ |
| First Byte to Requested | < 600ms | ✓ |
| Bundle Size | < 250KB (gzipped) | ✓ |
| Favicon Load | < 1s | ✓ (266KB) |

## Troubleshooting

### Service Worker Issues
1. Check `/public/sw.js` exists
2. Verify browser supports ServiceWorker
3. Clear cache: `caches.keys().then(names => names.forEach(n => caches.delete(n)))`
4. Check DevTools > Application > Service Workers

### Cache Not Working
1. Check cache headers in Network tab
2. Verify max-age values
3. Test with cache disabled (DevTools)
4. Check Netlify cache rules

### Slow Pages
1. Profile with Lighthouse
2. Check largest DOM elements
3. Verify images are optimized
4. Check API response times
5. Review JavaScript execution

## References
- [Next.js Optimization](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web.dev Performance](https://web.dev/performance/)
- [MDN Web Vitals](https://developer.mozilla.org/en-US/docs/Web/Vitals)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
