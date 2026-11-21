# Chi Tiêu Manager 💰

Quản lý chi tiêu thông minh với sức mạnh của AI (Gemini). Nhập dữ liệu tự động bằng cách chat hoặc gửi ảnh màn hình chuyển khoản!

## 🌟 Tính năng nổi bật
- 🤖 **Ghi nhận chi tiêu bằng AI**: Tự động trích xuất số tiền, mô tả và phân loại từ tin nhắn text hoặc ảnh chụp màn hình (hóa đơn, chuyển khoản).
- 📊 **Thống kê trực quan**: Biểu đồ chi tiết theo ngày, tháng, quý, năm.
- 🗂️ **Quản lý Hũ ngân sách**: Đặt ngân sách cho từng danh mục và nhận cảnh báo khi sắp vượt mức.
- 💳 **Quản lý công nợ**: Theo dõi các khoản vay/cho vay, tiến độ trả nợ.
- ⚡ **Chat AI trả nợ nhanh**: Cập nhật tiến độ trả nợ nhanh chóng qua chat.
- 🔒 **Tài khoản an toàn**: Đăng ký/đăng nhập bằng email và mật khẩu; Google OAuth là lựa chọn bổ sung.
- 📱 **Mobile-First UX**: Trải nghiệm mượt mà trên mọi thiết bị.

## 🛠️ Công nghệ sử dụng
- **Framework**: Next.js 16 (App Router)
- **Database**: Turso (libsql/sqlite)
- **AI**: Google Gemini (3.5 Flash, 2.5 Flash Lite)
- **Auth**: NextAuth.js
- **UI Components**: Shadcn UI, Tailwind CSS
- **Charts**: Recharts

## 📸 Ảnh chụp màn hình
*(Thêm ảnh chụp màn hình ứng dụng vào thư mục `public/screenshots` và cập nhật đường dẫn tại đây)*

![Dashboard](./public/screenshots/dashboard.png)
![AI Chat](./public/screenshots/chat.png)

## 🚀 Hướng dẫn cài đặt nhanh

### 1. Cài đặt dependencies
```bash
pnpm install
```

### 2. Thiết lập biến môi trường
Tạo file `.env` từ `.env.example` và điền các thông tin cần thiết:
```bash
cp .env.example .env
```

| Biến môi trường | Bắt buộc | Mô tả |
|-----------------|----------|-------|
| `TURSO_DATABASE_URL` | Có | URL kết nối đến database Turso |
| `TURSO_AUTH_TOKEN` | Có | Token xác thực Turso |
| `GEMINI_API_KEY` | Có | API Key từ Google AI Studio |
| `NEXTAUTH_URL` | Có | URL của ứng dụng (vd: http://localhost:8080) |
| `NEXTAUTH_SECRET` | Có | Khóa bí mật cho NextAuth (tạo ngẫu nhiên) |
| `NEXT_PUBLIC_SHORTCUT_INSTALL_URL` | Không | Link chia sẻ iCloud của mẫu “Ghi chi tiêu” để bật nút cài trên iPhone |

Để bật cài qua iCloud, chia sẻ mẫu có hai câu hỏi khi nhập phím tắt là URL giao dịch và token. Mẫu gửi `POST` với header `Authorization: Bearer <token>` và JSON có trường `text` lấy từ tác vụ nhập liệu hoặc đọc chính tả. Để trống URL và token trong mẫu trước khi chia sẻ, rồi đặt link iCloud vào biến trên và build lại app.
| `GOOGLE_CLIENT_ID` | Không | Client ID cho Google OAuth (tùy chọn) |
| `GOOGLE_CLIENT_SECRET` | Không | Client Secret cho Google OAuth (tùy chọn) |

### 3. Chạy ứng dụng
```bash
pnpm dev
```
Truy cập `http://localhost:8080` để xem ứng dụng.

## 📚 Tài liệu
- [Yêu cầu nghiệp vụ (BRD)](./docs/BRD.md)
- [Đặc tả yêu cầu phần mềm (SRS)](./docs/SRS.md)
- [User Stories](./docs/USER_STORIES.md)
- [Hướng dẫn sử dụng](./docs/USER_GUIDE.md)
- [Báo cáo kiểm thử](./docs/TEST_REPORT.md)
- [Hướng dẫn triển khai trên Nginx và PM2](./docs/DEPLOY_SELF_HOST.md#nginx-và-pm2)

- [Kế hoạch nâng cấp](./docs/UPGRADE_ROADMAP.md)

## 📄 License
Dự án được phân phối dưới giấy phép MIT. Xem file `LICENSE` để biết thêm chi tiết.
