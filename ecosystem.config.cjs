/**
 * PM2 config cho Chi Tiêu Manager.
 *
 * Production (bản standalone, giống Docker):
 *   bash deploy/deploy.sh
 *   (build, chép bản build sang .release/ rồi start/reload chi-tieu + chi-tieu-cron)
 *
 * Dev:
 *   pm2 start ecosystem.config.cjs --only chi-tieu-dev
 *
 * Biến môi trường production đọc từ .env.production (NEXTAUTH_URL, NEXTAUTH_SECRET,
 * GEMINI_API_KEY, CRON_SECRET, ...). Các giá trị trong `env` bên dưới sẽ đè lên file đó.
 */

const PORT = 3210;

module.exports = {
  apps: [
    {
      name: 'chi-tieu',
      cwd: __dirname,
      // Chạy từ .release/ (không phải .next/standalone) để lúc build lại app đang chạy không bị ảnh hưởng.
      script: '.release/server.js',
      node_args: '--env-file-if-exists=.env.production',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(PORT),
        HOSTNAME: '0.0.0.0',
        ALLOW_LOCAL_DEV_BYPASS: 'false',
        // Auth.js production yêu cầu tin host; hoặc đặt AUTH_URL trong .env.production.
        AUTH_TRUST_HOST: 'true',
        // DB lấy từ TURSO_DATABASE_URL trong .env.production.
        // Không có thì dùng file:./data/chi-tieu.db (cwd = thư mục dự án).
      },
    },
    {
      // Thay cho container cron trong docker-compose: gọi nhắc nhở PWA mỗi 15 phút.
      name: 'chi-tieu-cron',
      cwd: __dirname,
      script: 'scripts/pm2-cron.mjs',
      node_args: '--env-file-if-exists=.env.production',
      cron_restart: '*/15 * * * *',
      autorestart: false,
      time: true,
      env: {
        CRON_TARGET: `http://127.0.0.1:${PORT}/api/cron/pwa-reminders`,
      },
    },
    {
      name: 'chi-tieu-dev',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'dev --port 8080',
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
