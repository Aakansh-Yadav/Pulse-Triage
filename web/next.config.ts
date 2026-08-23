import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Hide the Next.js "Rendering…" / N badge in local dev. Errors still surface.
  devIndicators: false,
};

export default nextConfig;
