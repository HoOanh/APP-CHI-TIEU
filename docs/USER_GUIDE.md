# 📖 Hướng Dẫn Sử Dụng - Chi Tiêu Manager

> Ứng dụng quản lý chi tiêu cá nhân thông minh, tích hợp AI Gemini để tự động nhận diện và phân loại giao dịch.

---

## Mục lục
1. [Bắt đầu sử dụng](#1-bắt-đầu-sử-dụng)
2. [Dashboard - Tổng quan](#2-dashboard---tổng-quan)
3. [AI Chat - Ghi nhận chi tiêu](#3-ai-chat---ghi-nhận-chi-tiêu)
4. [Chi tiêu & Thu nhập](#4-chi-tiêu--thu-nhập)
5. [Ngân sách - Hũ chi tiêu](#5-ngân-sách---hũ-chi-tiêu)
6. [Thống kê](#6-thống-kê)
7. [Công nợ](#7-công-nợ)
8. [Cài đặt](#8-cài-đặt)
9. [Giải pháp tổng thể](#9-giải-pháp-tổng-thể)
10. [FAQ & Xử lý sự cố](#10-faq--xử-lý-sự-cố)

---

## 1. Bắt đầu sử dụng

### Yêu cầu
- Node.js 18+
- pnpm (khuyến nghị) hoặc npm
- Google Gemini API Key (lấy tại [aistudio.google.com](https://aistudio.google.com))

### Cài đặt
```bash
# Clone và cài đặt
git clone <repo-url>
cd chi-tieu-manager
pnpm install

# Chạy ứng dụng
pnpm dev
```

### Cấu hình API Key
1. Mở app → vào **Cài đặt** (icon ⚙️ góc trên phải)
2. Dán **Gemini API Key** vào ô input
3. Nhấn nút 💾 để lưu
4. Kiểm tra badge "🟢 Sẵn sàng" xuất hiện

> **Lưu ý**: API Key được lưu an toàn trong database. App hỗ trợ **multi-model fallback** — tự động chuyển sang model khác khi hết quota.

---

## 2. Dashboard - Tổng quan

Dashboard là trang chính, hiển thị tổng quan tài chính tháng hiện tại:

### Các thông tin hiển thị
| Mục | Ý nghĩa |
|-----|---------|
| **Số dư tháng này** | = Tổng thu - Tổng chi |
| **Tổng thu** | Tổng các khoản thu nhập (xanh lá, dấu +) |
| **Tổng chi** | Tổng các khoản chi tiêu (đỏ, dấu -) |
| **TB chi/ngày** | = Tổng chi ÷ Số ngày trong tháng |
| **Tổng nợ** | Tổng các khoản nợ chưa trả |
| **Giao dịch gần đây** | 5 giao dịch mới nhất |

### Thao tác nhanh
- **"Ghi nhận chi tiêu"** → Mở AI Chat để nhập giao dịch
- **"Trả nợ nhanh"** → Mở chat AI quản lý công nợ
- Nhấn **"Xem tất cả"** → Xem đầy đủ danh sách chi tiêu

---

## 3. AI Chat - Ghi nhận chi tiêu

Đây là tính năng **cốt lõi** — ghi nhận chi tiêu bằng ngôn ngữ tự nhiên hoặc ảnh chụp.

### Cách sử dụng

#### Ghi chi tiêu bằng text
Gõ tự nhiên, AI sẽ tự nhận diện:

```
✅ "ăn phở bò 50k"           → -50.000đ, 🍜 Ăn uống
✅ "đổ xăng 200k"            → -200.000đ, 🚗 Di chuyển  
✅ "mua giày nike 1tr5"      → -1.500.000đ, 🛍️ Mua sắm
✅ "tiền điện tháng 7: 350k" → -350.000đ, 📄 Hóa đơn
✅ "gym 3 tháng 1.2tr"       → -1.200.000đ, 💊 Sức khỏe
```

#### Ghi thu nhập
AI tự phân biệt thu nhập dựa trên ngữ cảnh:

```
✅ "nhận lương tháng 7 là 20 triệu"  → +20.000.000đ, 💵 Thu nhập
✅ "freelance design 5tr"              → +5.000.000đ, 💵 Thu nhập
✅ "bán đồ cũ được 500k"              → +500.000đ, 💵 Thu nhập
```

#### Ghi bằng ảnh chụp
1. Nhấn icon 📷 (bên trái ô input)
2. Chọn ảnh chụp hóa đơn, biên lai, hoặc màn hình chuyển khoản
3. AI sẽ tự trích xuất: **số tiền**, **mô tả**, **danh mục**, **ngày**
4. Xác nhận để lưu

> **Hỗ trợ**: Ảnh chụp chuyển khoản ngân hàng, hóa đơn nhà hàng, bill mua sắm, receipt thanh toán online...

### Quy tắc nhận diện
- **Từ khóa "thu nhập"**: lương, freelance, bán, nhận, tiền về, thưởng → **Thu nhập (+)**
- **Mặc định**: Mọi giao dịch khác → **Chi tiêu (-)**
- AI phân loại vào 10 danh mục tự động

---

## 4. Chi tiêu & Thu nhập

Trang danh sách giao dịch chi tiết.

### Tính năng
- **Số dư ròng** tháng hiện tại (Thu - Chi)
- **Lọc theo danh mục**: Nhấn tab danh mục (Ăn uống, Di chuyển, Mua sắm...)
- **Lọc theo tháng**: Dùng mũi tên ◀ ▶ chuyển tháng
- **Group by ngày**: Giao dịch nhóm theo ngày, hiển thị tổng/ngày
- **Xóa giao dịch**: Nhấn icon thùng rác 🗑️ trên mỗi giao dịch
- **Thêm nhanh**: Nhấn nút **+** (FAB xanh góc phải dưới)

### Phân biệt thu/chi
- **Thu nhập**: Hiện màu **xanh lá** với dấu **+** (vd: +20.000.000đ)
- **Chi tiêu**: Hiện màu **đỏ** với dấu **-** (vd: -200.000đ)

---

## 5. Ngân sách - Hũ chi tiêu

Thiết lập hũ ngân sách cho từng danh mục, có **giới hạn nâng cao** theo ngày hoặc tần suất.

### Tạo hũ chi tiêu
1. Vào tab **Ngân sách** (thanh navigation dưới)
2. Nhấn nút **+** (FAB xanh)
3. Chọn **Danh mục** (VD: Ăn uống)
4. Nhập **Ngân sách tháng** (VD: 3.900.000)
5. Đặt **% cảnh báo** (mặc định 80%)
6. *(Tùy chọn)* Thiết lập **Giới hạn nâng cao**
7. Nhấn **"Lưu ngân sách"**

### Giới hạn nâng cao

#### Giới hạn theo ngày
Đặt số tiền tối đa cho mỗi ngày.

| Ví dụ | Cách thiết lập |
|-------|---------------|
| Ăn: max 130k/ngày | Giới hạn chi/ngày = `130000` |
| Cafe: max 50k/ngày | Giới hạn chi/ngày = `50000` |

#### Giới hạn theo tần suất
Đặt số lần tối đa cho mỗi chu kỳ (tuần hoặc tháng).

| Ví dụ | Cách thiết lập |
|-------|---------------|
| Thể thao: 2 lần/tuần | Số lần = `2`, Chu kỳ = `/ tuần` |
| Nhậu: 2 lần/tháng | Số lần = `2`, Chu kỳ = `/ tháng` |
| Xem phim: 3 lần/tháng | Số lần = `3`, Chu kỳ = `/ tháng` |

### Cảnh báo
Khi vượt ngưỡng, hũ sẽ hiện badge cảnh báo:
- 🟡 **Cảnh báo** (vàng): Đạt % ngưỡng cảnh báo (mặc định 80%)
- 🔴 **Nguy hiểm** (đỏ): Vượt 100% ngân sách hoặc vượt giới hạn ngày/tần suất

### Sao chép tháng trước
Nhấn **"Sao chép tháng trước"** để tự động copy toàn bộ hũ chi tiêu từ tháng trước sang tháng hiện tại (bao gồm cả giới hạn nâng cao).

---

## 6. Thống kê

Xem biểu đồ và phân tích chi tiêu.

### Chế độ xem
| Tab | Hiển thị |
|-----|----------|
| **Tháng** | Biểu đồ cột theo ngày trong tháng |
| **Năm** | Biểu đồ cột theo tháng trong năm |
| **Quý** | Biểu đồ cột theo quý |
| **Tất cả** | Biểu đồ cột theo năm (5 năm gần nhất) |

### Thông tin hiển thị
- **Tổng chi tiêu**: Chỉ tính chi tiêu (không gộp thu nhập)
- **Trung bình/ngày**: Tổng chi ÷ số ngày trong tháng
- **Biểu đồ cột**: Chi tiêu theo thời gian
- **Biểu đồ tròn**: Cơ cấu chi tiêu theo danh mục (%)
- **Bảng breakdown**: Chi tiết từng danh mục + số tiền + %

---

## 7. Công nợ

Quản lý các khoản vay/cho vay.

### Tạo khoản nợ
1. Vào trang **Công nợ** (từ Dashboard → "Trả nợ nhanh")
2. Thêm khoản nợ: Tên, số tiền, người vay/cho vay
3. Theo dõi tiến độ trả nợ qua progress bar

### Chat AI Trả nợ
Ghi nhận thanh toán nợ qua chat tự nhiên:
```
✅ "trả Bình 500k"
✅ "Mai chuyển cho mình 1tr"
```

---

## 8. Cài đặt

### Kết nối AI
- Nhập/thay đổi **Gemini API Key**
- Kiểm tra trạng thái kết nối (🟢 Sẵn sàng / 🔴 Lỗi)

### Danh mục chi tiêu
- Xem 10 danh mục mặc định
- Thêm danh mục tùy chỉnh (icon + tên + màu)

### Dữ liệu & Lưu trữ
- Xem dung lượng database
- Export/Backup dữ liệu

---

## 9. Giải pháp tổng thể

### Kiến trúc hệ thống

```
┌─────────────────────────────────────────────┐
│                    Client                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │Dashboard │ │ AI Chat  │ │  Expenses    ││
│  │  page.tsx│ │ page.tsx │ │  page.tsx    ││
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘│
│       │            │              │         │
│  ┌────┴────┐ ┌─────┴─────┐ ┌─────┴────────┐│
│  │Budgets  │ │  Stats    │ │  Debts       ││
│  │page.tsx │ │ page.tsx  │ │  page.tsx    ││
│  └────┬────┘ └─────┬─────┘ └──────┬───────┘│
└───────┼────────────┼───────────────┼────────┘
        │            │               │
┌───────┼────────────┼───────────────┼────────┐
│       ▼            ▼               ▼   API  │
│  /api/budgets  /api/expenses  /api/debts    │
│  /api/chat     /api/categories /api/settings│
└───────┬────────────┬───────────────┬────────┘
        │            │               │
┌───────▼────────────▼───────────────▼────────┐
│              Services Layer                  │
│  ┌─────────────────┐ ┌────────────────────┐ │
│  │   Gemini AI     │ │    SQLite/Turso    │ │
│  │  (gemini.ts)    │ │    (db.ts)        │ │
│  │  Multi-model    │ │    schema.ts      │ │
│  │  Fallback       │ │                   │ │
│  └─────────────────┘ └────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Flow chính: Ghi nhận chi tiêu

```
User gõ "ăn phở 50k" ─► Frontend POST /api/chat
                              │
                              ▼
                        Gemini AI phân tích
                        (callGeminiWithFallback)
                              │
                              ▼
                        Parse JSON response:
                        {amount: 50000,
                         description: "ăn phở",
                         category: "Ăn uống",
                         type: "expense"}
                              │
                              ▼
                        INSERT INTO expenses
                              │
                              ▼
                        Trả về response card
                        (-50.000đ ✅ Chi tiêu đã ghi nhận)
```

### AI Multi-Model Fallback

Khi một model hết quota, app tự động chuyển sang model khác:

```
Priority 1: gemini-3.5-flash-lite   (nhanh và tối ưu chi phí)
Priority 2: gemini-3.6-flash        (độ chính xác cao hơn)
Priority 3: gemini-2.5-flash        (fallback ổn định)
```

### Database Schema

```sql
-- Bảng chi tiêu
expenses (id, amount, description, note, category_id, expense_date, type, created_at)

-- Bảng danh mục
categories (id, name, icon, color)

-- Bảng hũ ngân sách
budget_jars (id, category_id, month, budget_amount, warning_percent,
             daily_limit, frequency_limit, frequency_period, created_at)

-- Bảng công nợ
debts (id, name, amount, paid_amount, type, note, created_at)

-- Bảng cài đặt
settings (key, value)
```

### Cấu trúc thư mục

```
chi-tieu-manager/
├── src/
│   ├── app/                    # Pages (App Router)
│   │   ├── page.tsx           # Dashboard
│   │   ├── chat/page.tsx      # AI Chat
│   │   ├── expenses/page.tsx  # Danh sách chi tiêu
│   │   ├── budgets/page.tsx   # Hũ ngân sách
│   │   ├── stats/page.tsx     # Thống kê
│   │   ├── debts/page.tsx     # Công nợ
│   │   ├── settings/page.tsx  # Cài đặt
│   │   └── api/               # API Routes
│   │       ├── chat/          # AI Chat endpoint
│   │       ├── expenses/      # CRUD + Stats
│   │       ├── budgets/       # CRUD + Copy
│   │       ├── categories/    # CRUD
│   │       ├── debts/         # CRUD + Payments
│   │       └── settings/      # Key-value store
│   ├── components/ui/         # Reusable UI components
│   └── lib/
│       ├── db.ts              # Database connection
│       ├── schema.ts          # Table definitions + migrations
│       ├── gemini.ts          # AI service + fallback
│       └── utils.ts           # Helpers (format, date...)
├── docs/                      # Tài liệu dự án
│   ├── BRD.md                 # Business Requirements
│   ├── SRS.md                 # Software Requirements Spec
│   ├── USER_STORIES.md        # User Stories
│   ├── DEPLOY.md              # Deployment Guide
│   ├── TEST_REPORT.md         # Test Report
│   └── USER_GUIDE.md          # Hướng dẫn sử dụng (file này)
└── data/                      # SQLite database file
    └── chi-tieu.db
```

---

## 10. FAQ & Xử lý sự cố

### Q: AI không nhận diện đúng số tiền?
**A**: Gõ rõ ràng hơn. VD: thay vì "mua đồ 1.5" → "mua đồ 1.500.000đ" hoặc "mua đồ 1tr5"

### Q: Hết quota Gemini?
**A**: App tự động chuyển sang model thấp hơn. Nếu tất cả đều hết:
1. Đợi quota reset (thường 1 phút)
2. Hoặc tạo API Key mới tại [aistudio.google.com](https://aistudio.google.com)

### Q: Cách thêm danh mục mới?
**A**: Vào **Cài đặt** → **Danh mục chi tiêu** → Nhấn nút **+**

### Q: Dữ liệu lưu ở đâu?
**A**: SQLite database tại `data/chi-tieu.db`. Có thể backup bằng cách copy file này.

### Q: Cách deploy lên server?
**A**: Xem [Hướng dẫn triển khai](./DEPLOY.md) chi tiết.

### Q: Cách thiết lập ngân sách theo bảng chi tiêu hàng tháng?
**A**: Ví dụ bảng chi tiêu 20.593.000đ/tháng:

| Hũ | Tiền/tháng | Giới hạn |
|----|-----------|---------|
| 🍜 Ăn | 3.900.000 | 130k/ngày |
| 🏋️ Thể thao | 400.000 | 2 lần/tuần |
| 🍺 Nhậu | 800.000 | 2 lần/tháng |
| 🏠 Nhà | 3.000.000 | — |
| 💳 Đào góp | 4.613.000 | — |
| 🚗 Xe/Xăng | 880.000 | — |
| 🎉 Ăn chơi | 4.000.000 | — |
| 🏗️ Chuyển nhà | 2.000.000 | — |
| 🤖 AI | 800.000 | — |

Tạo từng hũ qua nút **+** trong trang **Ngân sách**, điền giới hạn nâng cao cho các hũ cần control (ăn, thể thao, nhậu).
