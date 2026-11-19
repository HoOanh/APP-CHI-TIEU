# Phân loại Người dùng, Onboarding & Cơ chế Module (Personas & Progressive Disclosure)

## 1. Triết lý thiết kế đa phân khúc

Một lỗi phổ biến của app tài chính là **nhồi mọi tính năng lên màn hình của mọi người**, khiến người chỉ muốn ghi "ăn trưa 50k" bị ngợp bởi hàng chục nút ví, tag, sổ chung, lãi suất.  
Giải pháp cho ARC Irobot v2.1 là **Core + Opt-in Modules**:
- Mọi tài khoản mới đều dùng chung **1 Core Engine** sạch sẽ (Dashboard, Chat AI, Giao dịch, Ngân sách, Công nợ, Thống kê).
- Ngay khi tạo tài khoản lần đầu (**Onboarding 2 bước**), người dùng chọn mục đích sử dụng → hệ thống tự bật bộ Module, danh mục mẫu và widget phù hợp nhất.
- Bất cứ lúc nào trong **Cài đặt → Gói tính năng & Nhu cầu**, người dùng đều có thể **bật/tắt hoặc nâng cấp thêm module** (hoặc chuyển đổi hồ sơ nhu cầu) mà không mất dữ liệu cũ.

---

## 2. Chi tiết 6 Phân loại Người dùng (Personas)

| Persona ID | Tên phân loại | Đặc điểm & Nỗi đau chính | Giá trị cốt lõi cần cung cấp |
| :--- | :--- | :--- | :--- |
| `speed_tracker` | **Ghi nhanh hàng ngày** | Tiêu lặt vặt nhiều lần/ngày, ngại mở form, hay quên cuối ngày. | Chat Fast-Path 0ms, Voice rảnh tay, Apple Shortcuts 1 chạm, Offline Queue tự đồng bộ. |
| `budget_discipliner` | **Siết kỷ luật ngân sách** | Lương về hay tiêu lố đầu tháng, cuối tháng thiếu tiền; cần rào chắn cứng. | Safe-to-Spend hôm nay, Payday Auto-Split chia hũ theo lương, Rollover số dư hũ, Push cảnh báo tức thì. |
| `debt_fighter` | **Quản lý vay & trả nợ** | Đang trả nhiều khoản vay/trả góp/đào góp/thẻ tín dụng hoặc cho người khác mượn tiền; dễ trễ hạn hoặc trả nợ xong bị hụt tiền tiêu. | Công nợ 2 chiều (`Đi vay` / `Cho vay`), đồng bộ trả nợ trừ/cộng thẳng vào ví, Debt Payoff Simulator, nhắc hạn trước 3 ngày. |
| `wealth_builder` | **Freelancer & Tích sản** | Thu nhập lên xuống thất thường, cần tách tiền ăn tiêu với quỹ tiết kiệm/dự phòng, cần biết mình sống được mấy tháng nếu ngưng làm. | Đa ví (`Ngân hàng`, `Tiết kiệm`, `Tiền mặt`), Chuyển khoản nội bộ không tính là chi, Báo cáo Thu–Chi–Saving Rate, Runway & Mục tiêu tích lũy. |
| `family_shared` | **Gia đình / Cặp đôi / Nhóm** *(v2.1)* | Vợ chồng góp quỹ chung, bạn cùng phòng chia tiền nhà/ăn uống, cần minh bạch ai chi gì. | Sổ quỹ chung (`Shared Ledger`), phân quyền thành viên, thông báo khi người kia ghi khoản chi, Smart Split tách bill. |
| `micro_business` | **Kinh doanh nhỏ / Pro** *(v2.1)* | Bán hàng online/studio bị lẫn tiền hàng với tiền sinh hoạt; cần hoàn ứng công ty; cần xuất Excel đối soát. | Sổ Kinh doanh tách biệt Sổ Cá nhân, Tag `#du-an`/`#hoan-ung`, Báo cáo Lãi/Lỗ (P&L) gọn, Import sao kê & Export CSV. |

---

## 3. Ma trận Module Flags (`user_settings` / `user_profiles`)

Hệ thống quản lý tập trung cấu hình qua bảng `user_profiles` (hoặc `user_settings` key `enabled_modules` + `persona_type`). Khi gọi `/api/profile`, backend trả luôn `persona` và `modules` để UI render thích ứng.

| Module Key | Mô tả chức năng khi BẬT | Mặc định bật cho Persona nào | Trạng thái khi TẮT |
| :--- | :--- | :--- | :--- |
| `multi_account` | Cho phép tạo nhiều ví (Tiền mặt, Bank, Ví điện tử, Thẻ tín dụng, Tiết kiệm) và ghi **Chuyển khoản nội bộ**. | `wealth_builder`, `debt_fighter`, `micro_business` | Dùng 1 `Ví chính` ẩn selector chọn ví để ghi nhanh nhất. |
| `budget_advanced` | Mở khóa tích chọn **Rollover**, **Payday Auto-Split** và widget **Safe-to-Spend** trên Dashboard. | `budget_discipliner`, `wealth_builder` | Hũ ngân sách giữ dạng cơ bản (tháng/ngày + cảnh báo %). |
| `debt_two_way` | Mở tab **Đi vay** vs **Cho vay**, đồng bộ trả nợ ↔ ví mặc định, **Payoff Simulator**. | `debt_fighter`, `wealth_builder` | Giữ danh sách công nợ gọn cơ bản. |
| `recurring_reminders` | Thiết lập giao dịch/hóa đơn định kỳ & nhận Push nhắc duyệt 1 chạm. | `budget_discipliner`, `debt_fighter`, `family_shared` | Ẩn mục Định kỳ trên menu để gọn UI. |
| `cashflow_pro` | Biểu đồ Thu–Chi–Saving Rate 12 tháng, chỉ số Runway, Mục tiêu tiết kiệm. | `wealth_builder`, `micro_business` | Trang Thống kê hiển thị phân tích chi tiêu gọn. |
| `shortcuts_automation` | Quản lý Shortcuts API Key & hướng dẫn Back-Tap/Automation. | `speed_tracker` (và luôn bật sẵn mục trong Cài đặt) | Vẫn truy cập được trong Cài đặt → Tích hợp. |
| `shared_ledgers` *(v2.1)* | Tạo nhiều Sổ (Cá nhân/Gia đình/Kinh doanh), mời thành viên dùng chung. | `family_shared`, `micro_business` | App dùng 1 Sổ cá nhân mặc định, ẩn switcher ở header. |
| `tags_and_reimburse` *(v2.1)* | Gắn `#tag` và đánh dấu hoàn ứng trên giao dịch, lọc & P&L theo sổ. | `micro_business`, `wealth_builder` | Ẩn trường Tag trong form nhập giao dịch. |

---

## 4. Luồng Onboarding khi tạo tài khoản mới

1. **Trigger**: Ngay sau khi user đăng ký thành công (`POST /api/auth/register` → auto sign-in) hoặc đăng nhập Google lần đầu (`onboarded_at IS NULL`), `proxy.ts` hoặc client shell điều hướng sang `/onboarding` *(có nút "Bỏ qua, dùng cấu hình tiêu chuẩn" để không cản trở user vội)*.
2. **Bước 1 — Chọn mục tiêu chính** (cho phép chọn **1 vai trò chính** hoặc **chọn nhiều thẻ**):
   - *"Ghi chi tiêu nhanh nhất có thể"* (`speed_tracker`)
   - *"Kiểm soát ngân sách & tránh lố hạn mức"* (`budget_discipliner`)
   - *"Theo dõi vay nợ, trả góp & cho mượn"* (`debt_fighter`)
   - *"Quản lý nhiều ví, dòng tiền & tiết kiệm"* (`wealth_builder`)
   - *"Quỹ chung gia đình / cặp đôi"* (`family_shared` - gắn badge *Sắp có / Beta* ở v2.0 hoặc mở ở v2.1)
   - *"Tách sổ kinh doanh nhỏ / hoàn ứng"* (`micro_business` - mở ở v2.1)
3. **Bước 2 — Thiết lập nhanh 10 giây** (tùy biến theo lựa chọn Bước 1):
   - Đặt tên/số dư ban đầu cho **Ví chính** (mặc định `0đ`, có thể bỏ qua).
   - Nếu chọn `multi_account`: gợi ý tick thêm nhanh các ví hay dùng (`Tiền mặt`, `Ngân hàng`, `Ví MoMo/ZaloPay`).
   - Chọn gói danh mục khởi tạo phù hợp (Sinh viên / Gia đình / Kinh doanh / Tiêu chuẩn).
4. **Hoàn tất**: Lưu `persona`, `enabled_modules`, `onboarded_at = datetime('now')` → đưa thẳng vào `/` (Dashboard) hoặc `/chat` nếu chọn `speed_tracker`.
5. **Nâng cấp/Thay đổi sau này**: Tại `/settings#nhu-cau-va-tinh-nang`, user có thể bật/tắt từng switch module bất kỳ lúc nào (dữ liệu đã tạo luôn được bảo toàn khi tắt/bật lại).
