/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
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
  },
  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/.prisma/**/*"],
    },
    optimizePackageImports: ["lodash-es"],
  },
};

export default nextConfig;
