import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 部署用
  poweredByHeader: false,
  // 小内存服务器构建：只用 1 个进程，并让 webpack 少占内存
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
  async headers() {
    return [
      {
        source: "/((?!pkg/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
