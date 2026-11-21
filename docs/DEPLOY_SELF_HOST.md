# Hướng dẫn triển khai Self-Host trên Server Vật Lý (`v2.1.0`)

Ứng dụng hỗ trợ self-host trên Ubuntu/Debian với Nginx và PM2 hoặc Docker Compose.

## Nginx và PM2

- Cấu hình hiện tại dùng [spending.arc-irobot.tech](https://spending.arc-irobot.tech) và chuyển tiếp tới cổng `3210` theo [mẫu Nginx](../deploy/nginx/spending.arc-irobot.tech.conf).
- Đặt `AUTH_URL` và `NEXTAUTH_URL` thành `https://spending.arc-irobot.tech` trong `.env.production`. Nếu bật Google OAuth, khai báo origin này và callback `https://spending.arc-irobot.tech/api/auth/callback/google` trong Google Cloud Console.
- Chạy `bash deploy/deploy.sh` để build bản standalone và reload cả `chi-tieu` lẫn `chi-tieu-cron`. Sau khi deploy, kiểm tra lượt chạy của cron bằng `pm2 logs chi-tieu-cron --lines 10 --nostream`.
- Nginx dùng header `X-Accel-Buffering: no` do Next.js trả về để chuyển tiếp màn chờ trong khi trang còn tải. Nếu cấu hình Nginx có `proxy_ignore_headers X-Accel-Buffering`, bỏ chỉ thị đó cho ứng dụng.

## Docker Compose

---

## 1. Yêu cầu hạ tầng tối thiểu
- **Server / VPS**: 2 vCPU, 2 GB RAM, 20 GB SSD trở lên (Ubuntu 22.04/24.04 LTS hoặc Debian 12).
- **Phần mềm**: Docker Engine `>= 24` & Docker Compose v2 (`docker compose version`).
- **Tên miền + HTTPS (Bắt buộc cho PWA & Web Push Notifications)**: Reverse proxy bằng **Caddy** hoặc **Nginx + Certbot**.

---

## 2. Chuẩn bị file `.env.production`

Tạo file `.env.production` ở thư mục gốc dự án (tuyệt đối không commit vào git):

```env
# NextAuth & Crypto
AUTH_URL=https://chitieu.yourdomain.com
NEXTAUTH_URL=https://chitieu.yourdomain.com
AUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_SECRET=<giống AUTH_SECRET>
AI_ENCRYPTION_KEY=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 24>
ALLOW_LOCAL_DEV_BYPASS=false

# Database nội bộ trong Docker Compose
TURSO_DATABASE_URL=http://sqld:8080
TURSO_AUTH_TOKEN=

# Google OAuth (tùy chọn, nếu bật đăng nhập Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AI Server Fallback Key (Gemini)
GEMINI_API_KEY=

# Web Push VAPID (chạy `npx web-push generate-vapid-keys`)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=mailto:admin@yourdomain.com

# Email SMTP (Nodemailer cho Quên mật khẩu & Mời sổ gia đình)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM="ARC Irobot <noreply@yourdomain.com>"
```

---

## 3. Di chuyển dữ liệu từ Turso Cloud sang Server Vật Lý (Zero Data Loss)

Nếu ĐẠI CA đang có dữ liệu thật trên Turso Cloud:

```bash
# 1. Cài Turso CLI và export toàn bộ DB thành file SQL
turso db shell <ten-db-production> .dump > turso_backup_$(date +%F).sql

# 2. Khởi chạy riêng container sqld trước để tạo volume dữ liệu
docker compose up -d sqld

# 3. Import dữ liệu SQLite dump vào sqld qua HTTP pipeline / sqlite3 hoặc libsql-client
# (Nếu chạy sqld mới tinh chưa có bảng, hãy chạy script Node nhỏ đọc từng statement trong .sql
# hoặc nối trực tiếp file SQLite trước khi gắn volume /var/lib/sqld/iku.db)
```

> [!TIP]
> Cách đơn giản và an toàn nhất khi vừa bật server mới: có thể giữ `TURSO_DATABASE_URL` trỏ tạm về Turso Cloud trong `.env.production` lúc đầu hoặc dùng công cụ **Xuất JSON** -> **Khôi phục JSON** ngay trong màn hình Cài đặt (`/settings#du-lieu`) cho từng tài khoản!

---

## 4. Build & Khởi chạy Docker Compose

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
docker compose logs -f app
```

Kiểm tra nhanh tại server:
```bash
curl -I http://127.0.0.1:3000/login
curl -s http://127.0.0.1:8080/health
```

---

## 5. Cấu hình Reverse Proxy HTTPS (Caddy gợi ý)

Cài Caddy trên host (`/etc/caddy/Caddyfile`):

```caddyfile
chitieu.yourdomain.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy: `sudo systemctl reload caddy`. HTTPS sẽ tự động được cấp Let's Encrypt, giúp **Service Worker (`/sw.js`)**, **IndexedDB Offline Queue** và **Web Push VAPID** hoạt động trên cả iOS Safari & Android Chrome.

---

## 6. Backup định kỳ

Thêm cron trên host Linux (`crontab -e`) mỗi ngày lúc 02:00 sáng:

```cron
0 2 * * * docker run --rm -v chi-tieu-manager_sqld_data:/data -v /root/backups:/backup alpine tar czf /backup/sqld-$(date +\%F).tar.gz -C /data . && find /root/backups -name "sqld-*.tar.gz" -mtime +14 -delete
```
