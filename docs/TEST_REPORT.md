# 📋 Báo Cáo Kiểm Thử - Chi Tiêu Manager

> **Ngày test**: 29/07/2026  
> **Phiên bản**: 1.0.0  
> **Môi trường**: localhost:3000 (Next.js 16 Dev)

---

## Tổng quan kết quả

| Metric | Kết quả |
|--------|---------|
| **Tổng test case** | 15 |
| **Pass** | 14 ✅ |
| **Fail ban đầu → Đã fix** | 1 🔧 |
| **Blocked** | 0 |

---

## 1. Module: AI Chat - Ghi nhận chi tiêu

### TC-01: Ghi chi tiêu bằng text
| | |
|--|--|
| **Input** | "ăn phở bò 50k" |
| **Expected** | Tạo expense -50.000đ, category "Ăn uống" |
| **Actual** | ✅ -50.000đ, 🍜 Ăn uống, ngày 29/07 |
| **Status** | **PASS** |

### TC-02: Ghi thu nhập bằng text
| | |
|--|--|
| **Input** | "nhận lương tháng 7 là 20 triệu" |
| **Expected** | Tạo income +20.000.000đ, category "Thu nhập" |
| **Actual** | ✅ +20.000.000đ, 💵 Thu nhập, type=income |
| **Status** | **PASS** |

### TC-03: Ghi chi tiêu khác danh mục
| | |
|--|--|
| **Input** | "đổ xăng 200k" |
| **Expected** | Tạo expense -200.000đ, category "Di chuyển" |
| **Actual** | ✅ -200.000đ, 🚗 Di chuyển |
| **Status** | **PASS** |

### TC-04: AI phân biệt thu/chi
| | |
|--|--|
| **Input** | Thu nhập (+) vs Chi tiêu (-) |
| **Expected** | Thu nhập hiện xanh lá (+), Chi tiêu hiện đỏ (-) |
| **Actual** | ✅ Thu nhập: xanh "+20.000.000đ", Chi: đỏ "-200.000đ" |
| **Status** | **PASS** |

---

## 2. Module: Dashboard (Tổng quan)

### TC-05: Tính toán số dư
| | |
|--|--|
| **Expected** | Số dư = Thu - Chi = 20.000.000 - 250.000 = 19.750.000đ |
| **Actual** | ✅ "19.750.000đ" |
| **Status** | **PASS** |

### TC-06: Hiển thị TB chi/ngày
| | |
|--|--|
| **Expected** | TB chi/ngày = 250.000 / 31 ≈ 8.065đ (chỉ tính expense) |
| **Actual** | ✅ "8.065đ" (sau fix, trước đó hiển thị sai 653.226đ do gộp income) |
| **Status** | **PASS** (đã fix) |

### TC-07: Giao dịch gần đây
| | |
|--|--|
| **Expected** | Hiển thị 3 giao dịch mới nhất |
| **Actual** | ✅ đổ xăng (-200k), nhận lương (+20tr), ăn phở bò (-50k) |
| **Status** | **PASS** |

---

## 3. Module: Chi tiêu & Thu nhập

### TC-08: Danh sách giao dịch
| | |
|--|--|
| **Expected** | Hiển thị tất cả giao dịch, group by ngày, filter by category |
| **Actual** | ✅ 3 giao dịch ngày 29/07, filter tabs hoạt động |
| **Status** | **PASS** |

### TC-09: Số dư ròng
| | |
|--|--|
| **Expected** | +19.750.000đ (Thu 20tr - Chi 250k) |
| **Actual** | ✅ "+19.750.000đ" |
| **Status** | **PASS** |

---

## 4. Module: Ngân sách (Hũ chi tiêu)

### TC-10: Tạo hũ với giới hạn nâng cao
| | |
|--|--|
| **Input** | Ăn uống: 3.900.000đ/tháng, 130.000đ/ngày |
| **Expected** | Tạo budget jar với daily_limit |
| **Actual** | ✅ Hũ "Ăn uống" 3.9tr, badge "130.000đ/ngày" |
| **Status** | **PASS** |

### TC-11: Tracking chi tiêu theo hũ
| | |
|--|--|
| **Expected** | Ăn uống: 50.000đ / 3.900.000đ = 1% |
| **Actual** | ✅ "50.000đ / 3.900.000đ" - 1%, badge "(50.000đ đã chi)" |
| **Status** | **PASS** |

---

## 5. Module: Thống kê

### TC-12: Biểu đồ chi tiêu (chỉ expense)
| | |
|--|--|
| **Expected** | Tổng chi tiêu = 250.000đ (không gộp income) |
| **Actual** | ✅ "250.000đ" (sau fix stats API) |
| **Status** | **PASS** (đã fix) |

### TC-13: Cơ cấu chi tiêu
| | |
|--|--|
| **Expected** | Di chuyển 200k (80%), Ăn uống 50k (20%) |
| **Actual** | ✅ Pie chart + breakdown đúng |
| **Status** | **PASS** |

---

## 6. Module: Cài đặt

### TC-14: Gemini API Key
| | |
|--|--|
| **Expected** | Hiển thị key đã lưu, trạng thái "Sẵn sàng" |
| **Actual** | ✅ Key masked "AIzSy...", badge xanh "Sẵn sàng" |
| **Status** | **PASS** |

### TC-15: Danh mục chi tiêu
| | |
|--|--|
| **Expected** | 10 categories mặc định |
| **Actual** | ✅ 10 categories: Ăn uống, Di chuyển, Mua sắm, Giải trí, Hóa đơn, Sức khỏe, Giáo dục, Tiết kiệm, Thu nhập, Khác |
| **Status** | **PASS** |

---

## Bugs phát hiện & Đã fix

### BUG-01: Stats API gộp income vào "Tổng chi tiêu"
- **Mô tả**: Stats API (`/api/expenses/stats`) không filter theo `type`, dẫn đến tổng chi tiêu = 20.250.000đ (gộp cả lương 20tr)
- **Root cause**: SQL query `SUM(amount)` không có điều kiện `WHERE type = 'expense'`
- **Fix**: Thêm filter `type = 'expense'` vào tất cả query trong stats API
- **Status**: ✅ Fixed & Verified

### BUG-02: Budget categories dropdown rỗng
- **Mô tả**: Khi tạo hũ chi tiêu, dropdown danh mục không hiện option
- **Root cause**: Filter `c.type === 'expense'` nhưng categories không có field `type`
- **Fix**: Bỏ filter, hiển thị tất cả categories
- **Status**: ✅ Fixed & Verified

### BUG-03: Budget copy thiếu fields mới
- **Mô tả**: "Sao chép tháng trước" không copy `daily_limit`, `frequency_limit`, `frequency_period`
- **Root cause**: SQL INSERT trong copy API chỉ có fields cũ
- **Fix**: Thêm 3 fields mới vào INSERT/ON CONFLICT
- **Status**: ✅ Fixed & Verified

### BUG-04: DB migration thiếu cho existing databases
- **Mô tả**: POST budget trả 500 vì DB cũ không có columns mới
- **Root cause**: Schema tạo bảng có fields mới nhưng DB đã tồn tại
- **Fix**: Thêm ALTER TABLE migration trong `initSchema()`
- **Status**: ✅ Fixed & Verified
