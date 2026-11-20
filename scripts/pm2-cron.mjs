// Chạy bởi PM2 (app "chi-tieu-cron") mỗi 15 phút: gọi endpoint gửi nhắc nhở PWA.
const target = process.env.CRON_TARGET;
const secret = process.env.CRON_SECRET;

if (!target || !secret) {
  console.error('Thiếu CRON_TARGET hoặc CRON_SECRET, bỏ qua.');
  process.exit(0);
}

try {
  const res = await fetch(target, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`${new Date().toISOString()} ${res.status} ${await res.text()}`);
} catch (error) {
  console.error(`${new Date().toISOString()} lỗi: ${error.message}`);
}
