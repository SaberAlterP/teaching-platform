import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 部署用
  poweredByHeader: false,
  // 小内存服务器构建：只用 1 个进程，并让 webpack 少占内存
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
  // AI 助手技能里的 HTML 模板（src/lib/ai/*.html）按文本导入
  webpack(config) {
    config.module.rules.push({ test: /\.html$/, type: "asset/source" });
    return config;
  },
  async headers() {
    return [
      {
        // 平台内置前端库：AI 生成的 HTML 包在沙箱（不透明来源）里用 ES module 加载，需要跨域头
        source: "/lib/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
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
