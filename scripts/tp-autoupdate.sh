#!/bin/bash
# 服务器自动更新脚本（root 的 cron 每 5 分钟运行一次，安装到 /usr/local/bin/tp-autoupdate.sh）。
# origin/main 有新提交时：拉代码 -> 停掉 app（腾出内存）-> 构建 -> 启动。
# 小内存服务器上构建很吃内存，app 不停掉会把机器拖到卡死；更新期间网站会短暂打不开。
# 手动更新：sudo /usr/local/bin/tp-autoupdate.sh --force
set -u
DIR=/home/admin/teaching-platform
LAST=/var/lib/tp-autoupdate.last
LOG=/var/log/tp-autoupdate.log
MIN_FREE_MB=600

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

compose stop app >> "$LOG" 2>&1
sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null
FREE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  log "可用内存只有 ${FREE_MB}MB，不够构建，取消更新并恢复旧版本"
  compose up -d >> "$LOG" 2>&1
  exit 1
fi

if timeout 30m docker compose -f "$DIR/docker-compose.yml" build >> "$LOG" 2>&1; then
  compose up -d >> "$LOG" 2>&1
  docker image prune -f >> "$LOG" 2>&1
  log "更新完成 ${REMOTE:0:7}"
else
  compose up -d >> "$LOG" 2>&1  # 构建失败：用旧镜像把网站恢复
  log "构建失败，已恢复旧版本"
  exit 1
fi
