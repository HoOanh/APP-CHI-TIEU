# User Stories

## Epic 1: Chi tiêu & Thu nhập
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US1.1 | **Là một** người dùng, **tôi muốn** thêm giao dịch thu/chi thủ công **để** ghi chép các khoản tiền mặt. | - Có form nhập: số tiền, mô tả, danh mục, ngày.<br>- Phân biệt rõ thu và chi.<br>- Giao dịch được lưu vào DB. | P0 |
| US1.2 | **Là một** người dùng, **tôi muốn** xem danh sách các giao dịch trong tháng **để** biết tiền của mình đã đi đâu. | - Hiển thị danh sách xếp theo ngày mới nhất.<br>- Hiển thị đủ icon danh mục, màu sắc, số tiền. | P0 |
| US1.3 | **Là một** người dùng, **tôi muốn** sửa/xóa giao dịch **để** đính chính thông tin khi nhập sai. | - Nút sửa/xóa ở mỗi giao dịch.<br>- Xác nhận trước khi xóa. | P1 |

## Epic 2: Ghi nhận bằng AI Chat
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US2.1 | **Là một** người dùng bận rộn, **tôi muốn** gõ text "ăn trưa 50k" **để** app tự động lưu khoản chi. | - AI phân tách số tiền: 50000, mô tả: "ăn trưa", danh mục: "Ăn uống".<br>- Báo thành công/lỗi rõ ràng. | P0 |
| US2.2 | **Là một** người dùng, **tôi muốn** copy/paste ảnh màn hình chuyển khoản vào khung chat **để** khỏi phải nhập tay. | - Chấp nhận paste ảnh từ clipboard hoặc chọn file.<br>- AI nhận diện chính xác số tiền, mô tả và thu/chi. | P0 |

## Epic 3: Thống kê & Báo cáo
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US3.1 | **Là một** người dùng, **tôi muốn** thấy tổng chi tiêu trên trang chủ **để** biết tháng này đã xài bao nhiêu. | - Hiển thị số tiền to rõ.<br>- Hiển thị số giao dịch và trung bình ngày. | P0 |
| US3.2 | **Là một** người dùng, **tôi muốn** xem biểu đồ chi tiêu theo danh mục **để** biết danh mục nào "ngốn" nhiều tiền nhất. | - Biểu đồ tròn (Pie chart) tỷ lệ các danh mục.<br>- Màu sắc biểu đồ khớp với màu danh mục cài đặt. | P1 |

## Epic 4: Ngân sách (Hũ)
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US4.1 | **Là một** người dùng, **tôi muốn** đặt ngân sách cho danh mục (vd: Ăn uống 3 triệu) **để** kiểm soát hạn mức. | - Nhập số tiền tối đa cho danh mục trong 1 tháng.<br>- Lưu trữ thành công. | P1 |
| US4.2 | **Là một** người dùng, **tôi muốn** thấy thanh tiến trình (progress bar) của các hũ ngân sách **để** điều chỉnh chi tiêu. | - Dashboard hiển thị thanh % chi tiêu.<br>- Đổi màu Đỏ/Vàng nếu vượt % cảnh báo (vd >80%). | P1 |

## Epic 5: Công nợ
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US5.1 | **Là một** người dùng, **tôi muốn** ghi chú khoản cho bạn vay 5 triệu **để** không bị quên. | - Thêm nợ mới: Tên người nợ, số tiền, ngày vay.<br>- Trạng thái "active". | P1 |
| US5.2 | **Là một** người dùng, **tôi muốn** cập nhật mỗi lần họ trả góp **để** biết còn thiếu bao nhiêu. | - Thêm payment cho khoản nợ.<br>- Thanh progress bar thể hiện tiến độ trả nợ.<br>- Đổi trạng thái "completed" khi trả đủ. | P1 |
| US5.3 | **Là một** người dùng, **tôi muốn** dùng AI chat để báo trả nợ (vd "Nhận 2tr từ Hùng") **để** tự cập nhật tiến độ. | - AI trích xuất tên khoản nợ và số tiền.<br>- Tự động insert payment vào khoản nợ tương ứng. | P2 |

## Epic 6: Cài đặt & Hệ thống
| ID | User Story | Acceptance Criteria | Priority |
|----|------------|---------------------|----------|
| US6.1 | **Là một** người dùng, **tôi muốn** tự thêm API Key của Gemini **để** sử dụng AI miễn phí bằng tài khoản cá nhân. | - Form nhập 1 hoặc nhiều API key.<br>- Lưu an toàn vào DB. | P0 |
| US6.2 | **Là một** người dùng, **tôi muốn** thêm danh mục chi tiêu mới (vd: "Thú cưng") **để** phù hợp nhu cầu. | - Tạo mới danh mục với tên, màu sắc, icon (emoji). | P2 |
| US6.3 | **Là một** người dùng, **tôi muốn** đăng nhập bằng tài khoản Google **để** bảo mật dữ liệu của mình. | - Nút "Sign in with Google".<br>- Dữ liệu cá nhân hóa theo user (nếu app hỗ trợ multi-user). | P0 |
