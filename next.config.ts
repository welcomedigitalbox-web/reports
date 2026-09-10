import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/sb/:path*", destination: "https://gbegeetiamspfaqhadhc.supabase.co/:path*" },
    ];
  },
};

export default nextConfig;
