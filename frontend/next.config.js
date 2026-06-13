/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode for better development experience
  reactStrictMode: true,

  // Enable standalone output for Docker production builds
  // This creates a minimal production bundle in .next/standalone
  output: 'standalone',

  // Configure API rewrites for backend communication
  // Uses API_URL for server-side rewrites (Docker internal network)
  // Falls back to NEXT_PUBLIC_API_URL or localhost for non-Docker dev
  async rewrites() {
    const apiUrl = process.env.API_URL
      || process.env.NEXT_PUBLIC_API_URL
      || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
