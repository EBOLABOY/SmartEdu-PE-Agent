import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
