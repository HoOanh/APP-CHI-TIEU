# Kế hoạch nâng cấp ARC Irobot

Mục tiêu là ghi một khoản chi bằng một lần gửi, vào thẳng màn cần dùng trên desktop và thấy phản hồi ngay khi app đang tải. Mobile giữ điều hướng dưới và luồng nhập hiện có. Mọi giao dịch đã lưu đều có thể chỉnh sửa.

## Phạm vi và thứ tự

| Đợt | Vấn đề | Thực hiện và tiêu chí nghiệm thu |
| --- | --- | --- |
| P0 · Điều hướng và tải trang | Chậm ở lần vào đầu, chuyển menu thiếu phản hồi, trạng thái rỗng dễ nhầm lỗi | JWT mới mang ID nội bộ, seed theo batch, gộp khởi tạo DB trong một instance, skeleton route, phản hồi trên link và tách tải/lỗi/rỗng ở ngân sách, công nợ và thống kê. Trên Vercel đo lần lạnh/ấm và ghi thời gian auth, DB init, SQL, API, hiển thị khung và hiển thị dữ liệu. |
| P1 · Desktop | Sidebar giấu tính năng trong Kế hoạch, header lặp tài khoản, bố cục mỗi màn lệch nhau | Mở trực tiếp Tổng quan, Giao dịch, Ngân sách, Công nợ, Thống kê và Cài đặt. Dùng một sidebar, lề và trục nội dung nhất quán. Soát 1280×800 và 1440×900, đồng thời kiểm tra mobile 390×844. |
| P1 · Ghi nhanh | Mở một trang dài cho một thao tác ngắn, ô nhập xa gợi ý, có bước duyệt | Desktop mở tại chỗ bằng nút hoặc phím N, tự đưa con trỏ vào ô nhập. Text và ảnh hợp lệ ghi thẳng, sửa ngay trên thẻ. Mobile tiếp tục dùng nút +. Một mã yêu cầu giữ nguyên khi retry. |
| P1 · Ghi giọng nói | Ghi một khoản chi trên iPhone và Mac cần ít thao tác | Mở Ghi nhanh và bấm mic. Chat tự gửi câu tiếng Việt khi nhận xong, tự chọn danh mục và ghi thẳng. Nếu trình duyệt không hỗ trợ, dùng mic bàn phím. Kiểm tra Safari và bản cài màn hình chính trên iPhone thật. |
| P2 · Độ sâu dữ liệu và thao tác | Giao dịch dài, truy vấn tháng nặng; độ trễ chờ AI; cài đặt máy chủ khó hiểu | Đo tải với lịch sử dài rồi chốt phân trang theo cursor, bộ lọc có thể chia sẻ bằng URL, panel sửa giao dịch, cache theo tài khoản có invalidation khi ghi/sửa/xóa. Đo thời gian AI riêng cho text/ảnh, thêm đường xử lý nhanh cho mẫu đơn giản nếu cần. Đưa migration có phiên bản ra khỏi request sau khi kiểm tra dữ liệu Turso và cách rollback. |

## Năm màn desktop cần rà

| Màn | Bất cập quan sát được | Thay đổi |
| --- | --- | --- |
| Ngân sách | Tab Kế hoạch thêm một tầng, tổng toàn số 0 chiếm chỗ khi chưa có hũ, hai nút tạo trùng vai trò | Ngân sách mở từ sidebar. Gộp tiêu đề và chọn tháng, ẩn tổng khi rỗng, một CTA cho hũ đầu tiên, ghi rõ thao tác sao chép. |
| Ghi giao dịch | Khung chat trải hết chiều cao, nội dung và ô nhập quá xa nhau | Hộp Ghi nhanh ngay trên màn đang xem. Giới hạn chiều cao, focus ô nhập, giữ nhập tay và ảnh, thẻ kết quả có nút Sửa. |
| Công nợ | Hai lớp tab, thẻ tổng và bảng lệch chiều rộng, dòng thiếu thao tác rõ | Mở trực tiếp, dùng nhóm lọc gọn và bảng cùng trục với tổng. Ưu tiên khoản gần hạn, đánh dấu quá hạn và để nút Chi tiết ngay trên dòng. |
| Hồ sơ và thống kê | Biểu đồ chiếm màn hình Cài đặt, thông tin tiền lặp | Desktop có Thống kê riêng. Cài đặt có mục Hồ sơ, AI, nhắc nhở, danh mục và dữ liệu. Mobile vẫn có phần thống kê trong Tài khoản. |
| AI và nhắc nhở | Giao thức, Base URL và thông báo VAPID chiếm màn; có nút bật khi máy chủ chưa sẵn sàng | Đưa thông số AI vào mục nâng cao, giữ chọn nhà cung cấp và API key ở luồng chính. Trạng thái thông báo dùng ngôn ngữ người dùng và vô hiệu hóa thao tác chưa khả dụng. |

## Trạng thái bản local

- Đã triển khai phần desktop trong bảng trên, tìm giao dịch theo nội dung/ghi chú và ghi ngay từ chat. API danh sách giao dịch lọc tháng theo khoảng ngày để tận dụng index hiện có.
- Chat có nút mic ngay ô nhập. Khoản chi có thể ghi khi chưa có hũ ngân sách. AI tự chọn danh mục theo nội dung và lịch sử, hoặc lưu vào **Chưa phân loại**.
- Dashboard đã xuất `Server-Timing` cho auth trong route, bước lấy kết nối đã khởi tạo và truy vấn. Thời gian proxy và độ trễ mạng cần đo riêng. Phiên Google cũ vẫn cần tra ID trong DB đến khi đăng nhập lại hoặc tạo phiên mới.
- Còn kiểm tra Preview/Production, xác minh mic và đọc chính tả trên iPhone và macOS thật, chốt region, quy trình migration và phân trang theo số đo.

## Xác minh trước khi phát hành

- Đường chuẩn từ lượt rà đầu tiên, chưa đăng nhập và một mẫu mỗi URL, là 1,88 giây TTFB cho `/` trả redirect và 1,97 giây cho `/login`. Đây chưa phải số đo desktop sau đăng nhập hoặc p95.
- Trên Preview/Production, đo từ tài khoản thật, so region Vercel với vị trí Turso và kiểm tra mở mới, chuyển menu, quay lại, mạng chậm. Mục tiêu ban đầu là phản hồi thao tác trong 150 ms và dữ liệu màn chính khi điều hướng ấm dưới 1 giây ở p75. Chốt ngưỡng sau khi có số liệu theo thiết bị và mạng.
- Kiểm tra phiên Google cũ và mới, dữ liệu trống, lỗi từng API, sửa từ Chat, giao dịch phát sinh từ thiết bị khác, nhập JSON và sao chép tháng.
- Giọng nói trong Chat dùng phiên đăng nhập web. Siri gọi trực tiếp từ ngoài web là một luồng riêng nếu triển khai sau.
