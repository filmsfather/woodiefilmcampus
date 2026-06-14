import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mupdf는 WASM 바이너리를 포함하므로 번들러가 인라인하지 않고
  // 런타임에 그대로 로드하도록 외부 패키지로 분리한다.
  serverExternalPackages: ["mupdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  turbopack: {
    // 최상위 lockfile 때문에 잘못된 루트를 잡지 않도록 Turbopack에 명시적으로 지정
    root: __dirname,
  },
  images: {
    // NAT64/DNS64 환경에서 Supabase 호스트가 64:ff9b:: 주소로 해석되면
    // Next.js 16의 사설 IP 차단이 이를 사설 IP로 오판해 이미지를 막는다.
    // 호스트는 아래 remotePatterns로 이미 제한되므로 차단을 해제한다.
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
