#!/usr/bin/env bash
# Build và chạy/reload app production bằng pm2.
# Gọi từ thư mục gốc dự án sau khi đã git pull:  bash deploy/deploy.sh
#
# Build ra .next/standalone, chép sang .release.new rồi mới đổi tên thành .release,
# nên trong lúc build app cũ vẫn chạy; build lỗi thì app cũ không bị đụng tới.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.production ] && [ ! -f .env ]; then
  echo "Thiếu .env.production (hoặc .env) ở $(pwd)" >&2
  exit 1
fi

# nvm (nếu có) để có node/pnpm/pm2 đúng phiên bản
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 22 ]; then
  echo "Cần Node 22 trở lên, đang là $(node -v)" >&2
  exit 1
fi

command -v pnpm >/dev/null || npm install -g pnpm@11
command -v pm2 >/dev/null || npm install -g pm2

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> pnpm build"
pnpm build

echo "==> chuẩn bị bản release"
rm -rf .release.new
cp -r .next/standalone .release.new
cp -r public .release.new/
mkdir -p .release.new/.next
cp -r .next/static .release.new/.next/

rm -rf .release.old
[ -d .release ] && mv .release .release.old
mv .release.new .release

echo "==> pm2"
pm2 startOrReload ecosystem.config.cjs --only chi-tieu,chi-tieu-cron --update-env
pm2 save

rm -rf .release.old

# Kiểm tra app đã lên
port=$(node -p 'require("./ecosystem.config.cjs").apps.find(a => a.name === "chi-tieu").env.PORT')
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${port}/login"; then
    echo "==> OK: app chạy ở cổng ${port}, commit $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "App không phản hồi ở cổng ${port}. Xem: pm2 logs chi-tieu" >&2
exit 1
