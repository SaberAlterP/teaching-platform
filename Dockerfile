# ---------- 构建 ----------
FROM node:22-alpine AS builder
WORKDIR /app
# 国内服务器拉取 npm 包较慢时，可取消下一行注释使用镜像源
# RUN npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run demo:build && npm run build

# ---------- 运行 ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# 迁移和初始化脚本需要的文件
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/demo-content/dist ./demo-content/dist
COPY --from=builder --chown=app:app /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=app:app /app/node_modules/bcryptjs ./node_modules/bcryptjs
USER app
EXPOSE 3000
# 启动时先自动执行数据库迁移
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
