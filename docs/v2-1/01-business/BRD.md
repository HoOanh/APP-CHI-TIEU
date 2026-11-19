# Business Requirements Document (BRD) — ARC Irobot v2.1

## 1. Tóm tắt điều hành (Executive Summary)

**ARC Irobot** chuyển dịch từ công cụ ghi chép chi tiêu cá nhân (`v1.2.2`) sang **nền tảng quản lý tài chính thông minh theo hướng SaaS đa phân khúc**, giữ triết lý cốt lõi: **tốc độ ghi sổ dưới 3 giây cho người dùng phổ thông**, đồng thời mở khóa các module chuyên sâu (**Đa ví, Công nợ 2 chiều đồng bộ dòng tiền, Ngân sách Rollover/Auto-Split, Tự động hóa Shortcuts, Sổ dùng chung Gia đình/Kinh doanh**) thông qua cơ chế **Onboarding phân loại + Progressive Disclosure**.

---

## 2. Mục tiêu kinh doanh (Business Objectives)

| Mã | Mục tiêu | Cách đo lường |
| :--- | :--- | :--- |
| **BO-1** | **Đạt độ tin cậy SaaS (Production-Grade Multi-tenant)** | 0 lỗi rò rỉ/xung đột dữ liệu liên user; 100% endpoint có validation, auth ownership và test tích hợp. |
| **BO-2** | **Tối ưu tốc độ ghi sổ & giảm chi phí AI** | ≥ 60% giao dịch chat text đơn giản xử lý qua Fast-Path 0ms (`< 150ms`); duy trì server AI fallback ổn định kèm bảo vệ chống lạm dụng. |
| **BO-3** | **Phục vụ đa phân loại người dùng bằng Modular UX** | User mới chọn nhu cầu khi Onboarding; bật/tắt nâng cấp module bất kỳ lúc nào trong Cài đặt mà không rối màn hình chính. |
| **BO-4** | **Hoàn thiện vòng đời tài khoản & khôi phục dữ liệu** | Hỗ trợ đăng nhập/đăng ký, quên/đổi mật khẩu qua Email (Nodemailer/SMTP), Import sao kê & Export/Restore đầy đủ. |
| **BO-5** | **Sẵn sàng hạ tầng mở rộng sang Server vật lý** | Không phụ thuộc cứng vào dịch vụ độc quyền của Vercel/third-party; DB SQLite/libSQL, SMTP và cron đều chạy được cả Serverless lẫn Node/Docker trên máy chủ vật lý. |

---

## 3. Phân loại đối tượng người dùng (6 Personas)

Chi tiết hành vi và cấu hình module xem tại [PERSONAS_AND_MODULES.md](./PERSONAS_AND_MODULES.md).

1. **Speed Tracker (Người bận rộn ghi siêu tốc)**: Cần ghi trong 3 giây qua Chat, Voice, Apple Shortcuts/Back-Tap, Offline queue.
2. **Budget Discipliner (Sinh viên / Người lương cố định)**: Cần kiểm soát chặt theo ngày (`Safe-to-Spend`), chia hũ khi nhận lương (`Payday Split`), chuyển số dư hũ (`Rollover`) và cảnh báo tức thì.
3. **Debt & Credit Fighter (Người trả nợ / Trả góp / Đào góp / Thẻ tín dụng)**: Cần theo dõi cả nợ phải trả lẫn cho vay, đồng bộ trả nợ vào số dư ví, mô phỏng lộ trình thoát nợ (`Avalanche`/`Snowball`).
4. **Cashflow & Wealth Builder (Freelancer / Người tích sản)**: Cần tách dòng tiền đa ví (Tiền mặt/Ngân hàng/Tiết kiệm), chuyển khoản nội bộ, báo cáo Thu–Chi–Saving Rate và Runway.
5. **Shared Household (Gia đình / Cặp đôi / Nhóm ở ghép)**: Cần sổ quỹ chung (`Shared Ledger`), biết ai đã chi khoản nào, chia tiền hóa đơn nhanh (`Smart Split`).
6. **Micro-Business & Pro (Chủ shop nhỏ / Người làm dự án / Power User)**: Cần tách Sổ Kinh doanh riêng với Sổ Cá nhân, gắn Tag dự án/hoàn ứng, Import sao kê ngân hàng & Export CSV/Excel.

---

## 4. Phạm vi dự án (Scope Management)

### 4.1 Trong phạm vi v2.0 (Sprints 1–4 · 4 tuần)
- **Baseline Stability**: Vá toàn bộ lỗi kỹ thuật v1.2.2 (`categories` multi-user & kind, `/debt-chat` gộp vào `/chat`, `/debts/[id]` DTO mismatch, `verify` HTTP status, timezone date utils, mobile search, SQLite FK pragma, Zod validation).
- **Onboarding & Module System**: Màn hình Onboarding sau khi tạo tài khoản cho chọn loại hình sử dụng; màn Cài đặt cho bật/tắt/nâng cấp các module.
- **Multi-Account & Transfers**: Quản lý nhiều ví/tài khoản (Tiền mặt, Ngân hàng, Ví điện tử, Thẻ tín dụng, Tiết kiệm) + giao dịch Chuyển khoản nội bộ không làm sai lệch tổng Thu/Chi.
- **Công nợ 2 chiều & Đồng bộ dòng tiền**: Phân biệt `payable` (đi vay) và `receivable` (cho vay); mặc định tự động trừ/cộng vào ví khi phát sinh thanh toán (có tùy chọn tắt cho khoản lịch sử); Debt Payoff Simulator.
- **Hũ ngân sách nâng cao (Opt-in)**: Tích chọn bật *Rollover* trên từng hũ, *Payday Auto-Split* khi có thu nhập, chỉ số *Safe-to-Spend hôm nay*.
- **Recurring Reminders (Notify-Only)**: Thiết lập khoản thu/chi/trả nợ định kỳ → đến hẹn gửi PWA Push + hiện thẻ chờ **Xác nhận 1 chạm** (tuyệt đối không tự động trừ tiền).
- **Unified AI Chat + Voice + Shortcuts**: Gộp `/debt-chat` vào `/chat`, thêm Fast-Path 0ms, AI Financial Q&A, hỗ trợ Whisper cho OpenAI/Groq, hoàn thiện Apple Shortcuts API (`/api/shortcuts/keys`, `/api/shortcuts/transactions`).
- **Email & Import/Export**: Tích hợp Nodemailer SMTP (Quên mật khẩu, Đổi mật khẩu), Export CSV (UTF-8 BOM) + JSON, Import/Restore JSON & Import CSV sao kê ngân hàng.

### 4.2 Trong phạm vi v2.1 (Sprints 5–6 · 2 tuần)
- **Multi-Ledger & Shared Workspaces**: Tạo nhiều sổ (Cá nhân, Gia đình, Kinh doanh), mời thành viên qua Email/Link token, phân quyền (`owner`, `editor`, `viewer`), notification chéo khi có chi tiêu mới trong sổ chung.
- **Smart Split, Tagging & Pro Reports**: Chia hóa đơn nhóm trong Chat AI, gắn Tag `#du-an`/`#hoan-ung`, báo cáo Cashflow 12 tháng + P&L gọn cho sổ kinh doanh.

### 4.3 Ngoài phạm vi hiện tại (Future Backlog · v2.2+)
- **Đa tiền tệ (Multi-currency)** cho giao dịch ngoại tệ (giữ chỗ cột `currency = 'VND'` trong DB để mở rộng sau mà không cần migrate phá cấu trúc).
- **Đồng bộ Open Banking trực tiếp** qua API ngân hàng (thay thế tạm bằng Import CSV sao kê + Shortcuts chụp màn hình/biến động số dư).
- **Quản lý danh mục đầu tư chứng khoán/crypto theo giá thị trường realtime**.

---

## 5. Tiêu chí thành công (KPIs & Success Metrics)

| Chỉ số | Mục tiêu |
| :--- | :--- |
| **Thời gian ghi giao dịch đơn giản (Fast-Path)** | `< 150ms` P95 (không gọi LLM) |
| **Thời gian tải Dashboard & Danh sách giao dịch (có phân trang)** | `< 800ms` P95 |
| **Tỷ lệ lỗi API 5xx do validation/DB constraint** | `0%` trên toàn bộ test suite |
| **Độ bao phủ kiểm thử tự động** | Unit + Integration tests cho toàn bộ Auth, Ledger, Budget, Debt, AI Router & Migration |
| **Tính di động hạ tầng (Portability)** | Deploy chạy được 100% trên Node.js + Docker + Server vật lý mà không phụ thuộc Vercel-only API |

---

## 6. Rủi ro & Phương án giảm thiểu (Risks & Mitigation)

1. **Rủi ro lạm dụng Server AI Key (chế độ B — giữ server fallback)**:
   - *Giảm thiểu*: Fast-Path 0ms cắt 60%+ lượng gọi LLM; áp dụng per-user/IP rate limiting mềm (chống bot/spam loop), giới hạn số lượng/dung lượng ảnh tối đa mỗi request.
2. **Rủi ro sai lệch số dư ví khi sửa/xóa giao dịch trả nợ liên kết**:
   - *Giảm thiểu*: Dùng DB transaction (`db.transaction('write')`) và ràng buộc `debt_payments.expense_id` để khi xóa/sửa payment thì giao dịch ví liên kết được cập nhật hoặc xử lý đồng bộ theo quy tắc rõ ràng.
3. **Rủi ro migration dữ liệu cũ của user v1.2.2**:
   - *Giảm thiểu*: Tự động backfill mỗi user cũ sang 1 `ledger` mặc định (`Cá nhân`) + 1 `account` mặc định (`Ví chính`) và gán toàn bộ `expenses`/`budget_jars`/`debts` hiện có vào đó trong transaction an toàn.
4. **Rủi ro tắc nghẽn Cron trên Vercel khi số user tăng**:
   - *Giảm thiểu*: Batch concurrency + tách generation AI insight khỏi vòng lặp gửi Push đồng loạt; kiến trúc sẵn sàng chạy worker riêng khi chuyển sang Server vật lý.
