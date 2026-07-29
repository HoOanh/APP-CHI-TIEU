# Chi Tiêu Manager 💰

Quản lý chi tiêu thông minh với sức mạnh của AI (Gemini). Nhập dữ liệu tự động bằng cách chat hoặc gửi ảnh màn hình chuyển khoản!

## 🌟 Tính năng nổi bật
- 🤖 **Ghi nhận chi tiêu bằng AI**: Tự động trích xuất số tiền, mô tả và phân loại từ tin nhắn text hoặc ảnh chụp màn hình (hóa đơn, chuyển khoản).
- 📊 **Thống kê trực quan**: Biểu đồ chi tiết theo ngày, tháng, quý, năm.
- 🗂️ **Quản lý Hũ ngân sách**: Đặt ngân sách cho từng danh mục và nhận cảnh báo khi sắp vượt mức.
- 💳 **Quản lý công nợ**: Theo dõi các khoản vay/cho vay, tiến độ trả nợ.
- ⚡ **Chat AI trả nợ nhanh**: Cập nhật tiến độ trả nợ nhanh chóng qua chat.
- 🔒 **Đăng nhập Google**: Bảo mật an toàn với NextAuth.js.
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
| `NEXTAUTH_URL` | Có | URL của ứng dụng (vd: http://localhost:3000) |
| `NEXTAUTH_SECRET` | Có | Khóa bí mật cho NextAuth (tạo ngẫu nhiên) |
| `GOOGLE_CLIENT_ID` | Có | Client ID cho Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Có | Client Secret cho Google OAuth |

### 3. Chạy ứng dụng
```bash
pnpm dev
```
Truy cập `http://localhost:3000` để xem ứng dụng.

## 📚 Tài liệu
- [Yêu cầu nghiệp vụ (BRD)](./docs/BRD.md)
- [Đặc tả yêu cầu phần mềm (SRS)](./docs/SRS.md)
- [User Stories](./docs/USER_STORIES.md)
- [Hướng dẫn sử dụng](./docs/USER_GUIDE.md)
- [Báo cáo kiểm thử](./docs/TEST_REPORT.md)
- [Hướng dẫn triển khai (DEPLOY)](./docs/DEPLOY.md)

## 📄 License
Dự án được phân phối dưới giấy phép MIT. Xem file `LICENSE` để biết thêm chi tiết.
