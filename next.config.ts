import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/dashboard/passwords/new',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
