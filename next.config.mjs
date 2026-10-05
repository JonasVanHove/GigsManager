/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  
  // Headers for security and caching
  async headers() {
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
  },

  // v1.45.0: Tesseract ships a WASM core and downloads language data at
  // runtime. It is only ever reached through a dynamic import on the OCR
  // fallback path, and it must not be traced into every API bundle — the
  // serverless function needs the package installed, not inlined.
  serverExternalPackages: ["tesseract.js"],

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
