import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
