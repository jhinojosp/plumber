import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "*.app.github.dev",
        "*.github.dev",
        "*.githubpreview.dev",
      ],
    },
  },
};

export default nextConfig;
