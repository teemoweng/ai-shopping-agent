import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/case-study",
        destination: "/vibe-coding-case-study.html",
      },
    ];
  },
};

export default nextConfig;
