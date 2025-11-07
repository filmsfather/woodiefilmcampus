import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  turbopack: {
    // 최상위 lockfile 때문에 잘못된 루트를 잡지 않도록 Turbopack에 명시적으로 지정
    root: __dirname,
  },
};

export default nextConfig;
