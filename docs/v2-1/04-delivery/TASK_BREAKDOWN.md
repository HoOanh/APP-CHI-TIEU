# Danh sách Task Chi tiết (Task Breakdown & DoD) — ARC Irobot v2.1

Ký hiệu Layer: `[DB]` Database/Migration · `[BE]` API/Lib · `[FE]` UI/Components · `[AI]` Prompt/Router · `[QA]` Tests/Verification.

---

## SPRINT 1 (Tuần 1): Baseline Bug-Fix, Migration DB & Auth/Mail

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | Definition of Done (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S1-01** | `[DB]` | Bật `PRAGMA foreign_keys = ON` và `WAL` (local) khi khởi tạo DB client. | `src/lib/db.ts` | 0.5d | FK constraints được enforce ở SQLite test; test xóa user/category kiểm tra cascade/restrict. |
| **S1-02** | `[DB]` | Thiết kế & viết migration `v2.0`: rebuild `categories` bỏ global unique (thêm partial unique + `kind`, `budget_group`), thêm bảng `ledgers`, `ledger_members`, `accounts`, `user_profiles`, `auth_tokens`, backfill user cũ. | `src/lib/schema.ts`, `src/lib/reset-account-data.ts` | 1.5d | Chạy migration trên DB có sẵn dữ liệu `v1.2.2` không lỗi, không mất record; 2 user tạo trùng tên danh mục thành công. |
| **S1-03** | `[BE]` | Sửa các bug API baseline: `verify` trả 400/502; `PUT /budgets/[id]` cập nhật đủ cột; `PUT /expenses/[id]` tính delta alert + `DELETE` trả 404; Zod cho `PUT /debts/[id]` & `PUT /categories/[id]`; fix DTO `debts/[id]/payments` & `debts/jars`. | `src/app/api/ai/providers/[id]/verify/route.ts`, `src/app/api/budgets/[id]/route.ts`, `src/app/api/expenses/[id]/route.ts`, `src/app/api/debts/[id]/route.ts`, `src/app/api/categories/[id]/route.ts`, `src/app/debts/[id]/page.tsx` | 1d | Verify sai key hiện toast lỗi; lịch sử & hũ trả nợ ở `/debts/[id]` hiển thị đúng ngày & số tiền. |
| **S1-04** | `[BE][FE]` | Sửa timezone bug ở `formatDate`/`formatShortDate` và tính tuần ở `budgets/route.ts`; sửa `proxy.ts` dev bypass tường minh; sửa lọc danh mục theo `kind` trong `ManualTransactionDialog`. | `src/lib/utils.ts`, `src/app/api/budgets/route.ts`, `src/proxy.ts`, `src/components/ManualTransactionDialog.tsx` | 0.5d | Unit test pass ở cả TZ `UTC-5` và `UTC+7`. |
| **S1-05** | `[BE][FE]` | Tích hợp Nodemailer SMTP (`src/lib/mailer.ts`), API `forgot-password` + `reset-password`, UI Quên mật khẩu trên `/login` & Đổi/Đặt mật khẩu trên `/settings`. | `package.json`, `src/lib/mailer.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`, `src/app/login/page.tsx`, `src/app/settings/page.tsx` | 1d | Gửi mail reset password thành công qua SMTP (hoặc log dev URL khi chưa set SMTP); token hết hạn/đã dùng bị từ chối. |
| **S1-06** | `[QA]` | Dọn sạch 8 ESLint warnings (`useWatch` thay `watch`, xóa unused imports); viết unit/integration test cho migration, multi-user categories, debt DTO. | `tests/*.test.mts`, các UI forms có warning | 0.5d | `pnpm lint` 0 errors 0 warnings; `pnpm test` & `tsc --noEmit` pass. |

---

## SPRINT 2 (Tuần 2): Onboarding, Module Flags, Multi-Account & Search/Pagination

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | DoD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S2-01** | `[BE]` | Mở rộng `/api/profile` (`GET`/`PATCH`) + tạo `POST /api/onboarding` lưu persona, active modules, tạo ví bổ sung & danh mục khởi tạo. | `src/app/api/profile/route.ts`, `src/app/api/onboarding/route.ts`, `src/lib/current-user.ts` | 1d | User mới có `onboardedAt = null`; gọi `/api/onboarding` khởi tạo đúng ví & modules. |
| **S2-02** | `[FE]` | Xây dựng trang `/onboarding` (2 bước + Bỏ qua) và mục **Nhu cầu & Tính năng mở rộng** trong `/settings` (Persona Presets + Module Toggles). | `src/app/onboarding/page.tsx`, `src/app/settings/page.tsx`, `src/components/AppShell.tsx` | 1.5d | Bật/tắt module làm ẩn/hiện tính năng tương ứng trên Dashboard, Menu, Form ngay lập tức. |
| **S2-03** | `[BE][FE]` | CRUD `/api/accounts` (`cash`, `bank`, `ewallet`, `credit_card`, `savings`); UI quản lý ví + thanh ví ngang trên Dashboard + chọn ví trong `ManualTransactionDialog`. | `src/app/api/accounts/**`, `src/app/api/dashboard/route.ts`, `src/app/page.tsx`, `src/components/ManualTransactionDialog.tsx` | 1.5d | Số dư từng ví và tổng số dư trên Dashboard khớp chính xác theo giao dịch. |
| **S2-04** | `[BE][FE]` | Hỗ trợ `type = 'transfer'` (Chuyển khoản nội bộ): validation `account_id !== to_account_id`, UI tab Chuyển khoản trong Form nhập tay, loại trừ transfer khỏi Thu/Chi/Ngân sách. | `src/app/api/expenses/route.ts`, `src/app/api/expenses/stats/route.ts`, `src/app/api/dashboard/route.ts`, `src/components/ManualTransactionDialog.tsx` | 0.5d | Chuyển 2tr từ Bank sang Tiền mặt: tổng tài sản giữ nguyên, `Tổng chi` không tăng. |
| **S2-05** | `[BE][FE]` | Sửa tìm kiếm bị ẩn trên mobile ở `/expenses`; thêm filter `type`, `account_id`, `from/to`; triển khai cursor pagination (`limit = 50`) + SQL aggregate summary. | `src/app/expenses/page.tsx`, `src/app/api/expenses/route.ts` | 0.5d | Mobile `< 768px` tìm kiếm & lọc mượt; cuộn "Tải thêm" khi > 50 giao dịch. |

---

## SPRINT 3 (Tuần 3): Unified AI Chat, Fast-Path 0ms, Debt 2-Way Sync & Shortcuts

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | DoD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S3-01** | `[BE][AI]` | Xây dựng `merchant_rules` & **Fast-Path 0ms** cho `/api/chat`: khớp `parseSimpleChatTransaction` + rule/lịch sử 100% thì lưu thẳng không gọi LLM; thêm nút *"Luôn phân loại thế này"* khi user sửa thẻ. | `src/app/api/chat/route.ts`, `src/lib/fast-path-parser.ts`, `src/app/api/merchant-rules/route.ts`, `src/components/TransactionChat.tsx` | 1d | Câu đơn giản quen thuộc trả kết quả `< 150ms` kèm `fast_path: true`. |
| **S3-02** | `[BE][AI][FE]` | Gộp `/debt-chat` vào `/chat` (redirect 308); sửa nhánh `debt` nhận ảnh + transaction + trả `receiptData`; thêm Intent **Financial Q&A** (hỏi số liệu thực từ DB) + Intent `transfer`. | `src/app/debt-chat/page.tsx`, `src/app/api/chat/route.ts`, `src/lib/gemini.ts`, `src/components/TransactionChat.tsx` | 1.5d | Gửi ảnh trả nợ ở `/chat` tạo payment + hiện card biên lai; hỏi `"tháng này ăn uống hết bao nhiêu"` trả số liệu đúng. |
| **S3-03** | `[AI]` | Tối ưu AI Provider fallback timeout (`<= 22s` tổng), payload guard ảnh (`6 ảnh, 5MB/ảnh`), rate limit mềm cho Server Key (`src/lib/rate-limit.ts`), hỗ trợ **Whisper** cho `openai_compatible`. | `src/lib/ai-provider.ts`, `src/lib/gemini.ts`, `src/lib/rate-limit.ts`, `src/app/api/chat/transcribe/route.ts` | 0.5d | Ghi âm hoạt động với cả OpenAI/Groq provider; ảnh quá cỡ trả `413`. |
| **S3-04** | `[BE][FE]` | Công nợ 2 chiều (`payable` vs `receivable`), mặc định đồng bộ `debt_payments` ↔ `expenses` (trừ/cộng ví), API & UI **Debt Payoff Simulator** (`Avalanche` vs `Snowball`). | `src/app/api/debts/**`, `src/app/debts/page.tsx`, `src/app/debts/[id]/page.tsx`, `src/lib/debt-simulator.ts` | 1d | Trả nợ mặc định trừ ví (bỏ tick được); xóa payment xử lý sạch liên kết; simulator tính chuẩn ngày tất toán. |
| **S3-05** | `[BE][FE]` | Hoàn thiện **Apple Shortcuts API** (`/api/shortcuts/keys` & `/api/shortcuts/transactions`) + UI tạo/thu hồi token trong Settings & modal `QuickEntryAccess`. | `src/app/api/shortcuts/keys/**`, `src/app/api/shortcuts/transactions/route.ts`, `src/app/settings/page.tsx`, `src/components/QuickEntryAccess.tsx` | 1d | Gửi text hoặc ảnh qua `POST /api/shortcuts/transactions` với Bearer token ghi sổ và trả `summaryText`. |

---

## SPRINT 4 (Tuần 4): Budget Opt-in, Recurring Notify, Offline Blob, Import/Export & v2.0

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | DoD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S4-01** | `[BE][FE]` | Hợp nhất `src/lib/budget-evaluator.ts` dùng chung Dashboard/Budgets/Alerts (bao gồm `frequency_limit`); thêm widget **Safe-to-Spend hôm nay**; thêm checkbox opt-in **Rollover** & **Payday Auto-Split**. | `src/lib/budget-evaluator.ts`, `src/app/api/budgets/**`, `src/app/api/dashboard/route.ts`, `src/app/budgets/page.tsx`, `src/app/page.tsx` | 1.5d | Copy hũ bật rollover cộng dồn chuẩn số dư; ghi thu nhập gợi ý chia hũ 1 chạm; Dashboard & Budgets khớp 100% cảnh báo. |
| **S4-02** | `[BE][FE]` | Xây dựng `recurring_rules` & `recurring_occurrences` (**Notify-Only**): UI quản lý lịch định kỳ, cron `reminders-worker.ts` (batch concurrency 5) gửi Push + banner **Xác nhận 1 chạm** trên app. | `src/lib/reminders-worker.ts`, `src/app/api/cron/pwa-reminders/route.ts`, `src/app/api/recurring/**`, `src/components/PendingRecurringBanner.tsx` | 1.5d | Đến hạn chỉ push & hiện thẻ chờ duyệt; tuyệt đối không tự trừ ví; bấm "Ghi nhận" mới tạo giao dịch. |
| **S4-03** | `[FE]` | Nâng cấp `offline-queue.ts`: lưu ảnh `Blob[]` vào IndexedDB, tự sync cả `ai_note` và ảnh khi mạng quay lại. | `src/lib/offline-queue.ts`, `src/components/TransactionChat.tsx`, `src/components/AppShell.tsx` | 0.5d | Tắt mạng gửi note + ảnh vào Chat → bật lại mạng tự đẩy lên `/api/chat` không trùng nhờ `client_request_id`. |
| **S4-04** | `[BE][FE]` | Mở rộng `/api/expenses/stats` & `/stats` thêm biểu đồ Thu–Chi–Saving Rate + Runway; thêm **Export CSV (UTF-8 BOM)**, **Import CSV sao kê ngân hàng** & **Restore JSON**. | `src/app/api/expenses/stats/route.ts`, `src/app/stats/page.tsx`, `src/app/api/export/route.ts`, `src/app/api/import/**`, `src/app/settings/page.tsx` | 1d | Excel mở CSV chuẩn tiếng Việt; Import CSV preview + phát hiện trùng lặp; Restore JSON an toàn. |
| **S4-05** | `[QA]` | E2E smoke test toàn bộ Release `v2.0.0` (mobile 390×844 & desktop 1440×900), kiểm tra Web Push thật & cập nhật `docs/TEST_REPORT.md`. | `tests/*.test.mts` | 0.5d | 100% test pass, không còn regression bug. |

---

## SPRINT 5 (Tuần 5): Multi-Ledger & Shared Family Wallet (`v2.1 Beta`)

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | DoD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S5-01** | `[BE]` | Xây dựng `assertLedgerAccess` middleware/helper kiểm tra quyền (`owner`/`editor`/`viewer`) trên toàn bộ API đọc/ghi tài chính. | `src/lib/ledger-access.ts`, toàn bộ `/api/expenses`, `/budgets`, `/debts`, `/accounts` | 1.5d | User không thuộc sổ bị từ chối `403`; `viewer` không thể `POST/PUT/DELETE`. |
| **S5-02** | `[BE][FE]` | CRUD `/api/ledgers`, API mời thành viên qua Email (Nodemailer) / Link Token (`/api/ledgers/[id]/invites`), Ledger Switcher trên Sidebar & Mobile header. | `src/app/api/ledgers/**`, `src/components/AppShell.tsx`, `src/app/settings/page.tsx` | 2d | Tạo Sổ gia đình, mời tài khoản thứ 2 tham gia và chuyển đổi sổ mượt mà. |
| **S5-03** | `[BE][FE]` | Hiển thị tên/avatar `created_by` trong giao dịch sổ chung; gửi Web Push chéo tới thành viên khác trong sổ khi phát sinh giao dịch mới. | `src/app/expenses/page.tsx`, `src/lib/web-push.ts`, `src/app/api/expenses/route.ts` | 1.5d | Vợ ghi chi tiêu vào Sổ gia đình → Chồng nhận Push thông báo real-time. |

---

## SPRINT 6 (Tuần 6): Smart Split, Tagging, Micro-Business P&L & Physical Server Packaging (`v2.1 GA`)

| Task ID | Layer | Mô tả công việc cụ thể | File tác động chính | Effort | DoD |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S6-01** | `[AI][BE][FE]` | **Smart Split** trong `/chat`: AI bóc tách chia tiền nhóm thành 1 `expense` phần mình + 1 `debt (receivable)` phần bạn bè nợ. | `src/lib/gemini.ts`, `src/app/api/chat/route.ts`, `src/components/TransactionChat.tsx` | 1.5d | Nhắn `"lẩu 800k chia 4, mình trả"` tự tạo chi tiêu 200k + khoản phải thu 600k. |
| **S6-02** | `[BE][FE]` | Hệ thống `#tags` & `reimburse_status` (`none|pending|settled`), lọc theo tag, card **Lãi/Lỗ (P&L)** cho sổ `business`; tách nhỏ `budgets/page.tsx` (`1.117` dòng) thành subcomponents. | `src/app/api/tags/**`, `src/app/expenses/page.tsx`, `src/app/stats/page.tsx`, `src/app/budgets/**` | 2d | Sổ kinh doanh lọc theo `#du-an`, đánh dấu đã hoàn ứng và xem P&L tháng. |
| **S6-03** | `[INFRA][QA]` | Đóng gói triển khai Server vật lý: `next.config.ts` (`output: 'standalone'`), `Dockerfile`, `docker-compose.yml` (App + `sqld` + Cron Worker), tài liệu `docs/DEPLOY_SELF_HOST.md` + Full QA `v2.1.0`. | `next.config.ts`, `Dockerfile`, `docker-compose.yml`, `docs/DEPLOY_SELF_HOST.md` | 1.5d | Chạy `docker compose up` trên máy local/server vật lý hoạt động đầy đủ Web + DB + Cron + SMTP. |
