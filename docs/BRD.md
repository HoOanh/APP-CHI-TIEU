# Business Requirements Document (BRD)

## 1. Mục tiêu kinh doanh (Business Objectives)
- Cung cấp một công cụ quản lý tài chính cá nhân thông minh, đơn giản, giảm thiểu rào cản nhập liệu bằng cách ứng dụng AI để tự động hóa quá trình ghi chép giao dịch.
- Tạo thói quen quản lý chi tiêu lành mạnh cho người dùng thông qua các tính năng như Hũ ngân sách (Budget Jars) và theo dõi công nợ chi tiết.
- Tận dụng hệ sinh thái serverless và Edge DB (Vercel + Turso) để vận hành ứng dụng với chi phí cực thấp hoặc miễn phí (cho quy mô nhỏ).

## 2. Đối tượng người dùng (Target Users)
- **Cá nhân, sinh viên, người mới đi làm**: Những người cần quản lý chi tiêu hàng ngày nhưng lười hoặc quên ghi chép thủ công.
- **Người có nhiều khoản chi tiêu qua chuyển khoản**: Có nhu cầu bóc tách thông tin tự động từ ảnh chụp màn hình ngân hàng/ví điện tử.
- **Người cần quản lý vay mượn**: Có các khoản vay/cho vay nhỏ lẻ, cần theo dõi tiến độ trả nợ tránh quên.

## 3. Phạm vi dự án (Scope)
**Trong phạm vi (In-Scope):**
- Quản lý thu/chi, phân loại danh mục.
- Quản lý ngân sách hàng tháng theo danh mục.
- Quản lý các khoản nợ và tiến trình thanh toán.
- Chat bot AI (nhận diện text và ảnh) để tạo dữ liệu tự động.
- Báo cáo thống kê trực quan.
- Xác thực người dùng bằng Google OAuth.

**Ngoài phạm vi (Out-of-Scope):**
- Liên kết trực tiếp với API của ngân hàng (do rào cản pháp lý và kỹ thuật).
- Quản lý tài sản phức tạp (chứng khoán, bất động sản, crypto).
- Tính năng chia sẻ quỹ chung cho nhóm/gia đình (Multi-user shared budget).

## 4. Tiêu chí thành công (Success Criteria)
- AI nhận diện chính xác >90% thông tin từ ảnh chụp bill/chuyển khoản chuẩn.
- Thời gian để người dùng tạo 1 giao dịch mới (thông qua chat/ảnh) dưới 5 giây.
- Dashboard load thông tin báo cáo trong vòng <2 giây.
- Hệ thống hoạt động ổn định trên nền tảng Vercel với Turso DB.

## 5. Giả định & Ràng buộc (Assumptions & Constraints)
**Giả định:**
- Người dùng có kết nối internet để sử dụng tính năng AI.
- Người dùng đồng ý chia sẻ hình ảnh giao dịch cho Gemini AI để xử lý.

**Ràng buộc:**
- Phụ thuộc vào Google Gemini API: Tính năng chat AI sẽ bị gián đoạn nếu API của Google gặp lỗi hoặc người dùng hết quota (429) và không có key dự phòng.
- Giới hạn lưu trữ miễn phí của Turso DB.

## 6. Rủi ro (Risks)
- **Rủi ro AI**: Nhận diện sai số tiền hoặc phân loại nhầm thu/chi gây sai lệch số dư. 
  - *Mitigation*: Luôn cho phép người dùng sửa lại thông tin sau khi AI đã parse xong, hoặc lưu log để đối soát.
- **Rủi ro Quota**: Người dùng hết lượt gọi API Gemini miễn phí.
  - *Mitigation*: Hỗ trợ thêm nhiều API Key trong phần Cài đặt và logic fallback tuần tự giữa các keys.
- **Rủi ro bảo mật**: Lộ dữ liệu tài chính cá nhân.
  - *Mitigation*: Ứng dụng mô hình xác thực mạnh với NextAuth, không lưu ảnh trên server (chỉ truyền dạng base64 rồi bỏ).
