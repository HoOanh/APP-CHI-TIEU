# Hướng dẫn Triển khai (Deployment Guide)

Tài liệu này hướng dẫn cách deploy ứng dụng Chi Tiêu Manager lên Vercel và thiết lập Database trên Turso.

## Yêu cầu chuẩn bị (Prerequisites)
- Tài khoản GitHub.
- Tài khoản [Vercel](https://vercel.com).
- Tài khoản [Turso](https://turso.tech).
- [Turso CLI](https://docs.turso.tech/cli/installation) đã được cài đặt trên máy.
- API Key của [Google Gemini (Google AI Studio)](https://aistudio.google.com/app/apikey).
- Tài khoản [Google Cloud Console](https://console.cloud.google.com/) để tạo OAuth Credentials.

---

## Step 1: Tạo Database trên Turso

1. Đăng nhập vào Turso qua CLI:
   ```bash
   turso auth login
   ```
2. Tạo database mới:
   ```bash
   turso db create chi-tieu-manager-db
   ```
3. Lấy chuỗi kết nối (Database URL):
   ```bash
   turso db show chi-tieu-manager-db --url
   ```
   *(Lưu lại giá trị này cho biến `TURSO_DATABASE_URL`)*
4. Lấy Auth Token:
   ```bash
   turso db tokens create chi-tieu-manager-db
   ```
   *(Lưu lại giá trị này cho biến `TURSO_AUTH_TOKEN`)*

---

## Step 2: Tạo Google OAuth Credentials

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một Project mới.
3. Vào menu **APIs & Services** > **OAuth consent screen**.
   - Chọn User Type là **External**.
   - Điền App name, User support email, Developer contact information. Lưu lại.
4. Vào menu **Credentials** > Chọn **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Chi Tieu Manager App`.
   - **Authorized JavaScript origins**: `http://localhost:3000` (để test local) và `https://your-app-domain.vercel.app` (URL thật sau khi deploy).
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google` và `https://your-app-domain.vercel.app/api/auth/callback/google`.
5. Bấm **Create**. Bạn sẽ nhận được **Client ID** và **Client Secret**. Lưu lại.

---

## Step 3: Lấy Gemini API Key
1. Truy cập [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Bấm **Create API key**.
3. Lưu lại API key cho biến `GEMINI_API_KEY`.

---

## Step 4: Đẩy Code lên GitHub
```bash
git add .
git commit -m "Initial commit for Chi Tieu Manager"
git push origin main
```

---

## Step 5: Deploy lên Vercel

1. Đăng nhập vào Vercel, chọn **Add New...** > **Project**.
2. Import repository GitHub của dự án.
3. Trong phần cấu hình dự án, mở mục **Environment Variables** và thêm các biến sau:

| Biến | Ví dụ |
|------|-------|
| `TURSO_DATABASE_URL` | `libsql://chi-tieu-manager-db-username.turso.io` |
| `TURSO_AUTH_TOKEN` | `ey...` |
| `GEMINI_API_KEY` | `AIzaSy...` |
| `NEXTAUTH_URL` | `https://your-app-name.vercel.app` |
| `NEXTAUTH_SECRET` | `tao_chuoi_ngau_nhien_bang_lenh: openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` |

4. Bấm **Deploy**. Đợi quá trình build hoàn tất.

---

## Step 6: Custom Domain (Tùy chọn)
1. Trong Vercel dashboard của dự án, vào **Settings** > **Domains**.
2. Thêm domain của bạn và cấu hình DNS CNAME/A record trỏ về Vercel theo hướng dẫn trên màn hình.
3. **Lưu ý quan trọng**: Nếu đổi domain, bạn phải quay lại **Google Cloud Console** (Step 2) để cập nhật lại `Authorized redirect URIs` với domain mới. Cũng cần đổi biến môi trường `NEXTAUTH_URL` trong Vercel thành domain mới.

---

## Troubleshooting (Xử lý sự cố)

1. **Lỗi `Database query failed`**:
   - Kiểm tra lại `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` xem đã copy chính xác chưa.
2. **Lỗi đăng nhập Google (`OAuthSignin` / `redirect_uri_mismatch`)**:
   - Kiểm tra `Authorized redirect URIs` trong Google Cloud Console đã khai báo chính xác domain của Vercel (kèm path `/api/auth/callback/google`) chưa.
3. **AI Chat báo lỗi hoặc trả về sai (`429 Quota Exceeded` hoặc `500`)**:
   - Kiểm tra xem API Key Gemini có bị hết hạn hay hết lượt gọi (quota) không. Có thể vào ứng dụng, mục Cài đặt (Settings) để thêm API key thứ 2.
