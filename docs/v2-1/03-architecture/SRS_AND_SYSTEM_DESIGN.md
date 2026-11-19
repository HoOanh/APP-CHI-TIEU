# Software Requirements Specification (SRS) & System Design — ARC Irobot v2.1

## 1. Kiến trúc hệ thống & Lộ trình chuyển dịch hạ tầng

### 1.1 Kiến trúc hiện tại (Cloud Serverless)
- **Web & API**: Next.js 16 App Router (`Node.js` runtime cho DB/Crypto/WebPush/Nodemailer), triển khai trên Vercel (`hnd1`).
- **Database**: Turso (`@libsql/client`) — SQLite tương thích chuẩn ANSI/SQLite3.
- **Scheduler**: GitHub Actions cron mỗi 5 phút gọi `/api/cron/pwa-reminders` xác thực bằng `CRON_SECRET` (`timingSafeEqual`).
- **Email Service**: Nodemailer + SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) — đồng bộ kiến trúc đã triển khai ở `arc-academy-backend`.

### 1.2 Nguyên tắc thiết kế sẵn sàng cho Server vật lý (Physical Server Readiness)
Để khi ĐẠI CA nâng cấp lên server vật lý (VPS/Bare-metal chạy Docker + Reverse Proxy) có thể chuyển đổi trong `< 1 giờ` mà không sửa code nghiệp vụ:
1. **Không dùng API độc quyền của Vercel** trong business logic (không dùng Vercel KV, Vercel Blob, Vercel Postgres, hay Edge-only bindings).
2. **Database Abstraction**: Tiếp tục dùng `@libsql/client` (trên server vật lý trỏ `TURSO_DATABASE_URL=file:/data/chi-tieu.db` hoặc `http://sqld:8080` chạy local `sqld`/libSQL server cùng Docker network). Bật `PRAGMA foreign_keys = ON` và `PRAGMA journal_mode = WAL` cho file DB local.
3. **Standalone Output & Worker Script**: Cấu hình `output: 'standalone'` trong `next.config.ts` khi đóng Docker; tách logic cron (`runReminderDispatch()`) thành hàm pure trong `src/lib/reminders-worker.ts` để trên Vercel gọi qua HTTP `/api/cron/pwa-reminders`, còn trên server vật lý chạy bằng system cron / worker process không bị giới hạn 60s.
4. **Rate Limiting trừu tượng**: Tạo `src/lib/rate-limit.ts` với interface `checkRateLimit(key, limit, windowMs)`: mặc định dùng Turso/in-memory sliding window (đủ cho serverless/single node), sẵn sàng cắm Redis khi lên cluster trên server vật lý.

---

## 2. Xử lý toàn bộ Lỗi Baseline (`v1.2.2` → `v2.0`)

Các lỗi đã phát hiện trong đợt audit `v1.2.2` được khóa thành yêu cầu bắt buộc tại **Sprint 1**:

1. **DB Foreign Keys & Connection Setup (`src/lib/db.ts`)**:
   - Đảm bảo thực thi `PRAGMA foreign_keys = ON` khi khởi tạo kết nối SQLite/libSQL.
   - Đưa migration khỏi nóng trên request thông thường hoặc tách script `migrate` chạy có kiểm soát theo `SCHEMA_VERSION` kèm lock an toàn.
2. **Schema `categories` Multi-User (`src/lib/schema.ts`, `api/categories/*`)**:
   - Sửa bảng `categories` bỏ constraint `UNIQUE(name)` toàn cục; thay bằng `idx_categories_global_name` + `idx_categories_user_name`.
   - Thêm cột `kind` (`'expense' | 'income' | 'both'`).
   - Bổ sung Zod validation cho `PUT /api/categories/[id]` và trả `409` rõ ràng khi trùng tên trong phạm vi user.
3. **Sửa DTO & Logic Công nợ (`/debts/[id]`, `/api/debts/[id]`, `/api/chat`)**:
   - Chuẩn hóa field API `payment_date`, `planned_amount`, `actual_paid` khớp 100% với UI `debts/[id]/page.tsx`.
   - Thêm Zod validation cho `PUT /api/debts/[id]`.
   - Gộp `/debt-chat` vào `/chat`, sửa nhánh `type === 'debt'` để nhận ảnh, lọc `status = 'active'`, chạy transaction và trả `receiptData`.
4. **Sửa Verify AI Provider (`api/ai/providers/[id]/verify/route.ts`)**:
   - Bắt buộc trả HTTP `400` hoặc `502` khi verify thất bại (thay vì HTTP 200 như hiện tại).
5. **Sửa Timezone Date Parsing (`src/lib/utils.ts`, `api/budgets/route.ts`)**:
   - Mọi hàm format/tính thứ trong tuần cho chuỗi `YYYY-MM-DD` phải parse rõ `new Date(year, month - 1, day)` hoặc `Date.UTC(...)` để không bị lệch ngày khi browser/server ở timezone khác `Asia/Ho_Chi_Minh`.
6. **Sửa Budget `PUT` & Alert Engine (`src/lib/budget-evaluator.ts`)**:
   - Hợp nhất logic tính alert (`monthly`, `daily`, `frequency`) vào `src/lib/budget-evaluator.ts`, dùng chung cho Dashboard, Budgets và Alert sau khi ghi/sửa giao dịch.
   - `PUT /api/budgets/[id]` cập nhật đầy đủ `daily_limit`, `frequency_limit`, `frequency_period`.
   - `PUT /api/expenses/[id]` đọc giá trị cũ trước khi `UPDATE` để tính delta chuẩn cho `getBudgetAlert`, và `DELETE` kiểm tra `rowsAffected` trả `404` nếu không tồn tại.
7. **Sửa Search Mobile & Phân trang (`expenses/page.tsx`, `api/expenses/route.ts`)**:
   - Mở hiển thị thanh search trên mobile/tablet (`< 1024px`) và thêm cursor/offset pagination + SQL aggregation cho `totalIncome`/`totalExpense`.

---

## 3. Yêu cầu Phi chức năng (Security, Reliability, Performance)

### 3.1 Bảo mật (Security)
1. **Authentication & Password Recovery**:
   - Giữ `Credentials` (`scrypt` 64-byte) + `Google` OAuth.
   - Bổ sung bảng `auth_tokens` lưu SHA-256 hash của reset-password token (TTL 30 phút, dùng 1 lần).
   - Cho phép user Google OAuth thiết lập mật khẩu đăng nhập bổ sung trong Cài đặt (*Set/Change Password*).
   - `proxy.ts`: Chỉ cho phép dev auto-login khi có biến tường minh `ALLOW_LOCAL_DEV_BYPASS=true` ở `NODE_ENV !== 'production'`, tránh bỏ qua auth nhầm khi test Credentials multi-user.
2. **Shortcuts API Keys**:
   - Token sinh ngẫu nhiên 32 bytes (`arc_sk_...`), chỉ trả plain-text **1 lần duy nhất** lúc tạo; DB chỉ lưu `key_hash = SHA-256(token)` và `key_prefix` để hiển thị.
   - Hỗ trợ thu hồi (revoke) từng key và `last_used_at`.
3. **Upload & Payload Limits**:
   - `/api/chat` & `/api/shortcuts/transactions`: tối đa `6 ảnh / request`, mỗi ảnh `<= 5MB`, tổng payload `<= 15MB`, whitelist MIME (`image/jpeg`, `image/png`, `image/webp`, `image/heic`).
   - `/api/budgets/import` & `/api/import/csv`: giới hạn kích thước file (`<= 2MB`, `<= 1.000 dòng / lần`).
4. **Rate Limiting** (chống spam/bảo vệ Server AI Key ở chế độ B):
   - `/api/auth/register` & `/api/auth/forgot-password`: tối đa `5 req / 15 phút / IP`.
   - `/api/chat` & `/api/chat/transcribe` (khi dùng Server Fallback Key): tối đa `30 req / phút / user` và `300 req / ngày / user` (nếu user dùng **BYOK key riêng**, nới rộng giới hạn cao hơn để không cản power user).

### 3.2 Hệ thống Email (Nodemailer SMTP)
- Triển khai module `src/lib/mailer.ts` theo pattern đã dùng ở `arc-academy`:
  - Lazy singleton transporter với `nodemailer.createTransport(...)`.
  - Nếu thiếu cấu hình `SMTP_HOST` / `SMTP_USER` trong dev local: log preview link ra console server thay vì crash app; trong production báo trạng thái rõ ràng ở healthcheck.
  - Các template email HTML gọn, responsive:
    1. **Đặt lại mật khẩu** (`Quên mật khẩu`).
    2. **Chào mừng & Hướng dẫn bắt đầu** (tùy chọn).
    3. **Mời tham gia Sổ chung** *(v2.1)*.

### 3.3 Hiệu năng & Xử lý Cron / Offline
1. **Fast-Path 0ms**: Trước khi gọi AI, kiểm tra mẫu văn bản đơn giản + `merchant_rules` + lịch sử trùng khớp → giảm ~60–80% độ trễ và token.
2. **AI Timeout Budget**: Giới hạn tổng thời gian 1 lượt gọi AI `<= 22s` (primary model `12s`, tối đa 1 fallback `10s`) thay vì lặp 6–9 model × `12s`.
3. **Cron Batching (`src/lib/reminders-worker.ts`)**:
   - Chạy song song theo batch `concurrency = 5` với `Promise.allSettled`.
   - Tách job tạo Weekly Insight chạy trước hoặc đánh deadline an toàn (`45s` stop loop trên Vercel) để đảm bảo không timeout 60s.
   - Mở rộng cron kiểm tra thêm `recurring_rules` đến hạn để gửi Push nhắc xác nhận 1 chạm.
4. **Offline Queue v2**: Lưu cả `QueuedTransaction`, `QueuedAiNote`, và `QueuedChatImages` (lưu `Blob[]` trực tiếp trong IndexedDB) để đồng bộ tự động toàn phần khi có mạng lại.
