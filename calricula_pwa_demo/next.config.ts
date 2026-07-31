import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  // Static assets and the service worker provide content-based cache busting.
  // A stable export build ID keeps exact-commit builds reproducible across
  // disposable checkout paths instead of injecting Next's random default ID.
  generateBuildId: async () => 'calricula-pwa-demo-0.1.0',
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
