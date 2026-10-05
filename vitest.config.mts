import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// 单元测试：只测不碰数据库的纯逻辑（判分、入参检查、路径安全等），npm test 几秒跑完
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" 在 Next.js 之外导入会报错；测试里换成空模块
      "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
