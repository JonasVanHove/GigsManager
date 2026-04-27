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
    ],
    formats: ["image/webp", "image/avif"],
    // Optimize images by default
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year in seconds
  },

  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/.prisma/**/*"],
    },
    optimizePackageImports: ["lodash-es"],
    // Dynamic page size for better performance
    ppr: false, // Partial prerendering (consider enabling for specific routes)
  },

  // Environment optimization
  env: {
    // Enable these to be used client-side if needed
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // Webpack optimization
  webpack: (config, { isServer }) => {
    config.optimization.minimize = true;
    return config;
  },

  // Swc compression
  swcMinify: true,

  // Production source maps optimization
  productionBrowserSourceMaps: false,
};

export default nextConfig;
