# User Stories & Acceptance Criteria — ARC Irobot v2.1

Quy ước độ ưu tiên:
- **P0**: Bắt buộc trong Release v2.0 (Baseline Stability + Core Personas).
- **P1**: Hoàn thiện trải nghiệm v2.0 (Automation, Import/Export, Mail, Simulators).
- **P2**: Release v2.1 (Multi-Ledger, Shared Family, Smart Split, Micro-Business P&L).

---

## Epic A: Ổn định lõi, Bảo mật & Vòng đời tài khoản (Baseline & Auth)

| ID | User Story | Acceptance Criteria (Given / When / Then) | Priority |
| :--- | :--- | :--- | :--- |
| **US-A1** | Là user mới/cũ, tôi muốn chọn nhu cầu sử dụng khi mới lập tài khoản và bật/tắt tính năng nâng cao trong Cài đặt để giao diện không bị rối. | - **Given** user đăng nhập lần đầu (`onboarded_at IS NULL`), **When** vào app, **Then** hiển thị màn `/onboarding` cho chọn 1+ nhu cầu (hoặc Bỏ qua).<br>- **When** bật/tắt module trong `/settings`, **Then** UI cập nhật ngay qua `/api/profile` và không làm mất dữ liệu cũ. | P0 |
| **US-A2** | Là user đăng ký bằng email/mật khẩu, tôi muốn đổi mật khẩu và khôi phục mật khẩu qua email khi quên. | - **Given** user bấm "Quên mật khẩu" trên `/login`, **When** nhập email hợp lệ, **Then** hệ thống gửi email chứa link token hết hạn sau 30 phút qua Nodemailer SMTP (trả thông báo trung lập tránh lộ email tồn tại).<br>- **When** mở link và nhập mật khẩu mới `>= 10` ký tự, **Then** hash scrypt được cập nhật và token bị vô hiệu hóa ngay. | P0 |
| **US-A3** | Là user bất kỳ trong hệ thống SaaS, tôi muốn tạo danh mục riêng trùng tên với user khác mà không bị lỗi hệ thống. | - **Given** User A đã tạo danh mục `"Cafe"`, **When** User B tạo danh mục `"Cafe"` (hoặc `"cafe"`), **Then** tạo thành công với `201 Created`; chỉ báo lỗi `409` nếu chính User B đã có danh mục tên đó hoặc trùng danh mục hệ thống. | P0 |
| **US-A4** | Là người quản trị AI provider trong Cài đặt, tôi muốn nút "Kiểm tra kết nối" báo đúng lỗi khi key/URL sai. | - **When** `POST /api/ai/providers/[id]/verify` thất bại, **Then** API trả HTTP `400`/`502` kèm `{ error }`, UI hiện toast màu đỏ thông báo lý do cụ thể. | P0 |

---

## Epic B: Đa ví, Chuyển khoản nội bộ & Sổ giao dịch nâng cao

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-B1** | Là Freelancer/Người có nhiều nguồn tiền (`wealth_builder`), tôi muốn quản lý riêng Tiền mặt, Tài khoản ngân hàng, Ví điện tử và Thẻ tín dụng để biết chính xác mỗi nơi còn bao nhiêu tiền. | - Tạo/sửa/lưu trữ (archive) tài khoản với `initial_balance` và loại ví.<br>- Số dư từng ví = `initial_balance + thu - chi + chuyển vào - chuyển ra`.<br>- Trên Dashboard và `/expenses` thấy được số dư tổng và số dư từng ví. | P0 |
| **US-B2** | Là user có nhiều ví, tôi muốn ghi nhận chuyển tiền giữa 2 ví (VD: rút ATM hoặc nạp MoMo) mà không bị tính vào "Tổng chi tháng này". | - Form nhập tay và Chat AI hỗ trợ `type = 'transfer'` với `account_id` (nguồn) và `to_account_id` (đích).<br>- Lưu thành cặp giao dịch liên kết hoặc record transfer trong 1 DB transaction.<br>- Báo cáo Thu/Chi và Hũ ngân sách **không cộng** giao dịch `transfer`. | P0 |
| **US-B3** | Là user dùng điện thoại, tôi muốn tìm kiếm và lọc giao dịch theo loại Thu/Chi, ví và từ khóa ngay trên mobile mà không bị ẩn. | - Thanh tìm kiếm hiển thị đầy đủ trên mọi viewport (`< 1024px` và desktop).<br>- `GET /api/expenses` hỗ trợ phân trang (`limit`, `cursor`), lọc `type`, `account_id`, `category_id`, `search`, và vẫn trả tổng thu/chi chính xác của kỳ đang lọc. | P0 |
| **US-B4** | Là người có nhiều danh mục thu nhập, tôi muốn tạo danh mục thu riêng (Lương, Thưởng, Freelance) và chọn được khi nhập tay lẫn chat AI. | - Bảng `categories` có `kind IN ('expense', 'income', 'both')`.<br>- `ManualTransactionDialog` lọc đúng danh mục theo `type` đang chọn thay vì khóa cứng `'Thu nhập'`. | P0 |

---

## Epic C: Ghi siêu tốc, Unified AI Chat, Voice & Shortcuts

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-C1** | Là user ghi nhanh (`speed_tracker`), tôi muốn câu đơn giản quen thuộc (VD: `"ăn trưa 50k"`) được lưu tức thì không phải chờ AI. | - Nếu câu khớp `parseSimpleChatTransaction` và khớp `merchant_rules` hoặc lịch sử 100% không mơ hồ, server lưu thẳng DB và trả response `< 150ms` kèm cờ `fast_path: true`.<br>- Có thể sửa danh mục ngay trên thẻ vừa lưu (và hệ thống học rule mới từ lần sửa đó). | P0 |
| **US-C2** | Là user đang trả nợ hoặc muốn hỏi số liệu, tôi muốn dùng chung 1 màn hình Chat (`/chat`) cho cả ghi thu/chi, chuyển khoản, trả nợ (kèm ảnh) và hỏi đáp số liệu. | - Gửi ảnh/text trả nợ qua `/chat` tự nhận diện khoản nợ `active`, tạo payment, trả `receiptData` hiển thị card biên lai.<br>- Hỏi `"tháng này ăn uống hết bao nhiêu?"` trả về số liệu thực từ DB + gợi ý ngắn, không báo lỗi `"Không thể xác định giao dịch"`. | P0 |
| **US-C3** | Là user dùng OpenAI/Groq mà không có Gemini key, tôi vẫn muốn dùng nút Mic để nhập giọng nói. | - `transcribeAudio` hỗ trợ gọi endpoint `/audio/transcriptions` (Whisper) nếu active provider có `protocol = 'openai_compatible'`. | P1 |
| **US-C4** | Là user dùng iPhone/Mac, tôi muốn tạo API key cho Apple Shortcuts để bấm nút sườn/Back-Tap là ghi thẳng giao dịch từ text hoặc ảnh bill vào sổ. | - Tạo/thu hồi token tại Cài đặt (hash SHA-256 trong DB, chỉ hiện raw token 1 lần).<br>- `POST /api/shortcuts/transactions` xác thực bằng `Bearer <token>`, hỗ trợ text + ảnh + `client_request_id` idempotency, kích hoạt cảnh báo Push nếu vượt hũ. | P1 |
| **US-C5** | Là user ở nơi mất mạng, tôi muốn ghi chú text hoặc chụp ảnh bill lưu nháp offline rồi app tự đồng bộ ngầm khi có mạng lại. | - `offline-queue` lưu cả `ai_note` và ảnh `Blob` trong IndexedDB.<br>- Khi sự kiện `online` kích hoạt, queue tự gửi lên `/api/chat` tuần tự theo `client_request_id` để không trùng lặp. | P1 |

---

## Epic D: Ngân sách kỷ luật & Nhắc hẹn định kỳ (Opt-in)

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-D1** | Là người siết kỷ luật (`budget_discipliner`), tôi muốn thấy hôm nay mình còn được tiêu tối đa bao nhiêu tiền trên Dashboard. | - Khi bật `budget_advanced`, Dashboard hiển thị card **Safe-to-Spend hôm nay** tính từ tổng hạn mức còn lại của các hũ trừ đi các khoản nhắc định kỳ chưa trả trong tháng chia cho số ngày còn lại. | P0 |
| **US-D2** | Là user tạo hũ ngân sách, tôi muốn tùy chọn tích bật **Chuyển dư sang tháng sau (Rollover)** hoặc **Chia hũ tự động khi nhận lương**. | - Mặc định tắt (checkbox opt-in).<br>- Khi bật `rollover_enabled` trên hũ và sao chép/tạo hũ tháng mới, phần dư (hoặc dư dương/âm theo chế độ chọn) tháng trước được cộng dồn vào `rollover_amount`.<br>- Khi ghi `Thu nhập` loại lương, hiện banner gợi ý chia vào các hũ theo % đã lưu. | P1 |
| **US-D3** | Là user có tiền nhà, hóa đơn, trả góp cố định, tôi muốn đặt lịch nhắc hẹn định kỳ nhưng chỉ nhận thông báo để tự duyệt chứ không tự trừ tiền. | - Tạo rule định kỳ (`monthly`, `weekly`, `yearly`, ngày nhắc trước hạn).<br>- Tới ngày, cron gửi Web Push + tạo item ở mục **Chờ xác nhận**. User bấm **Đã thanh toán (1 chạm)** mới ghi thành `expense` thật (cho phép sửa số tiền trước khi lưu). | P1 |

---

## Epic E: Công nợ 2 chiều, Đồng bộ ví & Lộ trình thoát nợ

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-E1** | Là user có cho bạn bè vay tiền, tôi muốn ghi nhận khoản **Cho vay (Receivable)** tách biệt với khoản **Đi vay (Payable)**. | - Bảng `debts` có `direction IN ('payable', 'receivable')`.<br>- Trang `/debts` hiển thị tổng riêng: *Đang nợ phải trả* và *Người khác nợ mình*. | P0 |
| **US-E2** | Là user trả nợ hoặc thu hồi nợ, tôi muốn khoản thanh toán mặc định trừ/cộng vào số dư ví để tiền trong ví luôn đúng thực tế. | - Modal trả nợ mặc định bật `"Đồng bộ dòng tiền vào ví"` + chọn `account_id`.<br>- Trong 1 transaction: ghi `debt_payments` + tạo `expenses` (`expense` nếu trả nợ, `income` nếu thu nợ) + gắn `expense_id`. Nếu xóa payment → tùy chọn xóa luôn giao dịch ví liên kết. | P0 |
| **US-E3** | Là user đang trả nhiều khoản nợ có lãi suất khác nhau (`debt_fighter`), tôi muốn xem mô phỏng thứ tự trả nợ tối ưu. | - Trang `/debts` có tab/panel **Lộ trình thoát nợ**: nhập số tiền có thể trả mỗi tháng → so sánh 2 chiến lược **Avalanche** (lãi cao trước) vs **Snowball** (nợ nhỏ trước), hiện ngày dự kiến sạch nợ và tổng lãi tiết kiệm. | P1 |

---

## Epic F: Thống kê Cashflow, Import/Export & Backup/Restore

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-F1** | Là Freelancer (`wealth_builder`), tôi muốn xem biểu đồ so sánh Thu vs Chi, Tỷ lệ tiết kiệm (%) và số tháng dự phòng (Runway). | - `/api/expenses/stats` bổ sung series `income`, `expense`, `net`, `saving_rate` theo kỳ.<br>- Khi bật `cashflow_pro`, `/stats` hiển thị biểu đồ cột đôi Thu/Chi và card Runway. | P1 |
| **US-F2** | Là user muốn chuyển dữ liệu từ ngân hàng vào app hoặc sao lưu toàn bộ, tôi muốn Export CSV/JSON và Import sao kê CSV / Restore JSON. | - Export CSV có UTF-8 BOM mở chuẩn tiếng Việt trong Excel.<br>- Import CSV sao kê ngân hàng có bước map cột (`Ngày`, `Số tiền`, `Nội dung`), preview, phát hiện trùng lặp và tự phân loại bằng rule/AI.<br>- Restore JSON kiểm tra schema an toàn trước khi nạp lại. | P1 |

---

## Epic G: Sổ quỹ chung Gia đình & Sổ Kinh doanh (v2.1)

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-G1** | Là cặp đôi/gia đình (`family_shared`), chúng tôi muốn tạo Sổ quỹ chung để cả hai cùng ghi chi tiêu và xem tổng hợp. | - Tạo Ledger mới (`kind = 'family'`), gửi lời mời qua Email (Nodemailer) hoặc link token.<br>- Giao dịch hiển thị avatar/tên `created_by_user_id`; push thông báo cho thành viên còn lại khi có giao dịch mới. | P2 |
| **US-G2** | Là user đi ăn nhóm, tôi muốn chat `"ăn lẩu 800k chia 4, tôi trả hết"` để tự tách phần chi của mình và phần cần đòi bạn bè. | - AI tách thành 1 `expense` (200k phần của mình) + 1 khoản `debt` (`direction = 'receivable'`, 600k phần cần thu lại). | P2 |
| **US-G3** | Là chủ shop nhỏ (`micro_business`), tôi muốn tách Sổ Kinh doanh, gắn `#tag` đơn hàng/hoàn ứng và xem lãi lỗ tháng. | - Chuyển đổi giữa Sổ Cá nhân ↔ Sổ Kinh doanh ở thanh điều hướng.<br>- Lọc giao dịch theo `#tag`, trạng thái hoàn ứng (`pending`/`settled`) và xem thẻ Doanh thu – Chi phí – Lợi nhuận ròng. | P2 |
