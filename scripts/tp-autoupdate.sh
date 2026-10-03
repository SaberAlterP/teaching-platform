#!/bin/bash
# 服务器自动更新脚本（root 的 cron 每 5 分钟运行一次，安装到 /usr/local/bin/tp-autoupdate.sh）。
# origin/main 有新提交时：拉代码 -> 网站不停机直接构建 -> 构建成功后换容器（只断几秒）。
# 构建失败网站不受影响；新版本起不来会自动换回旧镜像。服务器 4G 内存，构建时需至少 1.2G 可用。
# 手动更新：sudo /usr/local/bin/tp-autoupdate.sh --force
set -u
DIR=/home/admin/teaching-platform
LAST=/var/lib/tp-autoupdate.last
LOG=/var/log/tp-autoupdate.log
MIN_FREE_MB=1200

exec 9>/var/lock/tp-autoupdate.lock
flock -n 9 || exit 0

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }
git_admin() { runuser -u admin -- git -C "$DIR" "$@"; }
compose() { (cd "$DIR" && docker compose "$@"); }
trap 'tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"' EXIT

git_admin fetch -q origin main || { log "fetch 失败"; exit 1; }
REMOTE=$(git_admin rev-parse origin/main)
if [ "${1:-}" != "--force" ] && [ "$REMOTE" = "$(cat "$LAST" 2>/dev/null)" ]; then exit 0; fi

# 不管成败都记下这次的版本：失败的构建不会每 5 分钟重试，等下一次提交或手动 --force
echo "$REMOTE" > "$LAST"
log "开始更新到 ${REMOTE:0:7}"

git_admin checkout -q -- . 2>/dev/null
git_admin merge -q --ff-only origin/main >> "$LOG" 2>&1 || { log "合并失败，取消更新"; exit 1; }

FREE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  log "可用内存只有 ${FREE_MB}MB，不够构建，取消更新（网站未受影响）"
  exit 1
fi

# 记下当前正在运行的镜像，新版本起不来时用它恢复
APP_CID=$(compose ps -q app 2>/dev/null)
OLD_IMAGE=$(docker inspect --format '{{.Image}}' "$APP_CID" 2>/dev/null)
IMAGE_NAME=$(docker inspect --format '{{.Config.Image}}' "$APP_CID" 2>/dev/null)
[ -n "$OLD_IMAGE" ] && docker tag "$OLD_IMAGE" tp-app-previous >> "$LOG" 2>&1

# 网站保持运行，直接构建新镜像
if ! timeout 30m docker compose -f "$DIR/docker-compose.yml" build >> "$LOG" 2>&1; then
  log "构建失败，网站仍在运行旧版本"
  exit 1
fi

# 构建成功后才切换容器（只会断几秒）
compose up -d >> "$LOG" 2>&1
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1/ 2>/dev/null; then
    docker image prune -f >> "$LOG" 2>&1
    log "更新完成 ${REMOTE:0:7}"
    exit 0
  fi
  sleep 3
done

log "新版本没有正常启动，正在恢复旧版本"
if [ -n "$OLD_IMAGE" ] && [ -n "$IMAGE_NAME" ]; then
  docker tag tp-app-previous "$IMAGE_NAME" >> "$LOG" 2>&1
  compose up -d --no-build --force-recreate app >> "$LOG" 2>&1
fi
exit 1
