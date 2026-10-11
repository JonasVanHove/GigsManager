/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  
  // Headers for security and caching
  async headers() {
    // Kept in sync with the Content-Security-Policy in netlify.toml so both
    // hosts emit identical policy. connect-src allows Supabase (API + realtime);
    // img-src stays permissive because band logos/avatars come from Supabase
    // storage, Gravatar and DiceBear. 'unsafe-eval' is required by some charting
    // and PDF dependencies in the client bundle.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' fonts.googleapis.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            // Force HTTPS for two years, including subdomains. Safe to enable
            // only on a host that terminates TLS end-to-end (Vercel/Netlify do).
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.gravatar.com",
      },
      // Fallback avatars for band members without a photo are generated
      // initials from DiceBear. Without this the whole Bands tab crashed with
      // "Invalid src prop ... hostname api.dicebear.com is not configured".
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
    formats: ["image/webp", "image/avif"],
    // Optimize images by default
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year in seconds
  },

  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": [
        "./node_modules/.prisma/client/schema.prisma",
        "./node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
        "./node_modules/@prisma/client/index.js",
        "./node_modules/@prisma/client/runtime/index.js",
      ],
    },
    outputFileTracingExcludes: {
      "/api/**/*": [
        "./node_modules/pdfjs-dist/**/*",
        "./node_modules/canvas/**/*",
        "./node_modules/.prisma/client/query_engine-*.tmp*",
        "./node_modules/.prisma/client/query_engine-*.dll.node*",
        "./node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
        "./node_modules/.prisma/client/libquery_engine-darwin-arm64.so.node",
        "./node_modules/.prisma/client/libquery_engine-darwin-x64.so.node",
        "./node_modules/.prisma/client/libquery_engine-linux-arm64.so.node",
        "./node_modules/.prisma/client/libquery_engine-linux-musl-arm64.so.node",
        "./node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node",
        "./node_modules/.prisma/client/libquery_engine-windows-openssl-3.0.x.dll.node",
        "./node_modules/.prisma/client/libquery_engine-windows-msvc.dll.node",
        "./node_modules/prisma/**/*",
      ],
    },
    optimizePackageImports: ["lodash-es"],
    // Dynamic page size for better performance
    ppr: false, // Partial prerendering (consider enabling for specific routes)

    // v1.45.0 / v1.47.0: Tesseract ships a WASM core and downloads language
    // data at runtime. It is only ever reached through a dynamic import on the
    // OCR fallback path, and it must not be traced into every API bundle — the
    // serverless function needs the package installed, not inlined.
    // Next 14.2 reads this key as `experimental.serverComponentsExternalPackages`;
    // the unprefixed `serverExternalPackages` name only exists from Next 15
    // onwards and produced a configuration warning here (fixed in v1.47.0).
    serverComponentsExternalPackages: ["tesseract.js"],
  },

  // Webpack optimization
  webpack: (config, { isServer }) => {
    config.optimization.minimize = true;
    
    // Provide safe fallbacks for modules that are server-only
    if (!config.resolve) config.resolve = {};
    if (!config.resolve.fallback) config.resolve.fallback = {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
      path: false,
      os: false,
    };

    return config;
  },

  // Swc compression
  swcMinify: true,

  // Production source maps optimization
  productionBrowserSourceMaps: false,
};

export default nextConfig;
