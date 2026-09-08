
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        '*.run.app',
        '**.run.app',
        '*.europe-west2.run.app',
        '**.europe-west2.run.app',
        '*.google.com',
        '**.google.com',
        '*.googleusercontent.com',
        '**.googleusercontent.com',
        '*.aistudio.google.com',
        '**.aistudio.google.com',
        '*.app.github.dev',
        '**.app.github.dev',
        '*.github.dev',
        '**.github.dev',
      ],
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
