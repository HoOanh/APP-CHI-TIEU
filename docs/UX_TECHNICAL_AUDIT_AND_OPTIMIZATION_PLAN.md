# Rà soát tổng thể & kế hoạch tối ưu

Ngày rà soát: 29/07/2026

## 1. Kết luận

Ứng dụng chưa sẵn sàng cho multi-user hoặc production.

Ba vấn đề nghiêm trọng nhất:

1. Dữ liệu tài chính không gắn với user. Mọi tài khoản sẽ đọc/sửa/xóa chung `expenses`, `budget_jars`, `debts`, `debt_payments`, `settings` và categories.
2. Auth chỉ mới có khung Google OAuth. Khi Google client ID thiếu hoặc là placeholder, middleware mở toàn bộ trang và API. Không có profile menu, sign-out, account settings hay data ownership.
3. UI hiện là mobile layout đặt giữa màn hình ở mọi breakpoint. Desktop 1440px vẫn chỉ có content 512px và bottom navigation kéo toàn chiều ngang.

Ưu tiên thực hiện theo thứ tự:

`P0 Auth + data isolation → P0 quality baseline → P1 responsive shell/design system → P1 UX flow → P2 hoàn thiện tính năng và polish`.

Không nên redesign UI trước khi data isolation hoàn tất: nếu làm ngược, mọi flow mới vẫn chạy trên mô hình dữ liệu dùng chung và phải sửa lại lần hai.

## 2. Phạm vi đã kiểm tra

- Source code, schema SQLite/Turso, toàn bộ API routes và các page chính.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- UI trực tiếp tại viewport mobile 390×844 và desktop 1440×900.
- Dashboard, Login, Expenses, Budgets, Stats, Chat, Debts và Settings.
- Đối chiếu BRD, SRS, User Stories và test report hiện tại.
- Đối chiếu flow Spendee: `Track → Analyze → Budget`, overview thu/chi, smart budget, daily allowance, desktop filters và bulk operations.

## 3. Kết quả kiểm tra kỹ thuật

| Check | Kết quả | Ghi chú |
|---|---:|---|
| TypeScript | Pass | `pnpm exec tsc --noEmit` exit 0 |
| ESLint | Fail | 9 errors, 24 warnings |
| Production build | Fail | `next/font/google` không tải được Inter; còn cảnh báo `middleware` deprecated |
| Unit test | Không có | Không có test file và không có script `test` |
| Integration test | Không có | API chưa có test tự động |
| E2E test | Không có | Không có Playwright/Cypress |
| Test report | Không tái lập được | `docs/TEST_REPORT.md` ghi 15 manual cases nhưng repo không có test executable |

Lỗi lint chính:

- `react-hooks/set-state-in-effect` tại Expenses, Budgets, Debts, Debt detail và Stats.
- `no-explicit-any` trong Settings API và Debt jars API.
- `prefer-const` trong Chat API.
- Nhiều import/biến chết và hai ảnh dùng `<img>` trong Chat.

Lỗi runtime xác nhận khi mở trang Công nợ:

- `DialogTrigger` đang bọc một `Button`, tạo HTML `<button><button>...</button></button>`.
- React báo invalid DOM nesting và hydration mismatch, sau đó phải render lại tree ở client.
- Cần dùng API composition của Base UI (`render`/equivalent theo version đang cài) để trigger chỉ tạo một button.

Build:

- `next/font/google` tạo dependency mạng tại build time. Cần self-host Inter bằng `next/font/local` hoặc commit font asset.
- Next.js 16.2.12 đã deprecate `middleware.ts`; cần chuyển sang `proxy.ts` theo docs của phiên bản đang cài.
- Dev log từng ghi `TypeError: Do not know how to serialize a BigInt`; cần chuẩn hóa ID trả về JSON thành `number` hoặc `string`.

## 4. Auth, profile và data ownership

### 4.1 Hiện trạng

- `src/lib/auth.ts` có Google provider và upsert `users`.
- Session gắn `userId` bằng `Object.assign`, chưa có type augmentation.
- Nếu upsert user lỗi, callback vẫn trả `true`; đăng nhập có thể thành công nhưng không có user DB hợp lệ.
- `src/middleware.ts` bỏ qua auth khi Google client ID thiếu hoặc bằng placeholder.
- Không có profile/avatar/name trong app shell.
- Không có sign-out.
- Không có account page, privacy controls hoặc delete/export account data.

### 4.2 Data leak/blocker

Các bảng sau không có `user_id`:

- `expenses`
- `budget_jars`
- `debts`
- `debt_jars`
- `debt_payments`
- `settings`
- `categories`

Tất cả API query hiện thiếu điều kiện `WHERE user_id = ?`. Route theo ID như `PUT/DELETE /api/expenses/:id` và `PUT/DELETE /api/debts/:id` là IDOR: user đăng nhập có thể thao tác record của user khác nếu biết ID.

`GET /api/settings` trả toàn bộ settings, bao gồm khả năng trả raw Gemini API key. Với schema global hiện tại, đây là rủi ro lộ secret giữa người dùng.

Database local hiện có:

- `users`: 0 record
- `expenses`: 4 records
- `budget_jars`: 1 record
- `debts`: 0 record
- `settings`: 0 record

Các record hiện có không thể xác định chủ sở hữu. Migration phải có chiến lược explicit, không được tự gán ngẫu nhiên.

### 4.3 Schema đích đề xuất

Giữ `users`, thêm:

- `accounts` và `sessions` nếu chuyển sang DB session adapter; hoặc tiếp tục JWT nhưng bắt buộc type-safe `session.user.id`.
- `user_settings(user_id, key, encrypted_value, updated_at)`, unique `(user_id, key)`.
- `categories(user_id nullable, is_system, name, icon, color, type)`.
- `expenses(user_id, ...)`.
- `budget_jars(user_id, ...)`, unique `(user_id, category_id, month)`.
- `debts(user_id, ...)`.
- `debt_jars(user_id, ...)`, unique `(user_id, debt_id, month)`.
- `debt_payments(user_id, debt_id, ...)`.

Foreign keys:

- Mọi bảng dữ liệu cá nhân tham chiếu `users(id)` với policy xóa phù hợp.
- Child records vừa kiểm tra ownership trực tiếp bằng `user_id`, vừa kiểm tra quan hệ parent.
- Bật `PRAGMA foreign_keys = ON` cho SQLite local.

Index tối thiểu:

- `expenses(user_id, expense_date)`
- `expenses(user_id, category_id, expense_date)`
- `budget_jars(user_id, month)`
- `debts(user_id, status)`
- `debt_payments(user_id, debt_id, payment_date)`

### 4.4 Contract auth bắt buộc

- Tạo helper server-only `requireUser()` trả typed `{ id, email, name, image }` hoặc ném 401.
- Mọi API route gọi `requireUser()`; không chỉ dựa vào Proxy.
- Mọi `SELECT/UPDATE/DELETE` theo ID phải kèm `user_id`.
- Production fail-fast nếu thiếu auth env; chỉ cho phép bypass bằng cờ rõ ràng như `ALLOW_INSECURE_LOCAL_AUTH=true` và chỉ trong development.
- Auth upsert lỗi phải fail sign-in.
- Không trả API key về client. Chỉ trả metadata như `{ configured: true, last4: "abcd" }`.
- API key phải mã hóa at-rest; khóa mã hóa nằm trong server env, không nằm trong DB.

## 5. UI/UX audit

### 5.1 App shell và responsive

Hiện tại:

- `src/app/layout.tsx` khóa main ở `max-w-lg`.
- Gần như không có responsive class trong page code.
- Desktop vẫn dùng bottom navigation kiểu mobile.
- Login vẫn render bottom navigation.
- Không có desktop sidebar/topbar, breadcrumb hoặc profile menu.
- `maximumScale: 1` và `userScalable: false` chặn pinch zoom, gây vấn đề accessibility.

Đích:

| Breakpoint | Navigation | Content |
|---|---|---|
| `< 768px` | Bottom nav 4 mục chính + More/Profile | Full width, 16px gutter, FAB/context CTA |
| `768–1199px` | Collapsible left rail | 2-column khi phù hợp |
| `≥ 1200px` | Sidebar cố định + topbar/profile | Max content 1200–1320px, dashboard grid 12 cột |

Route public (`/login`) dùng auth layout riêng, không render app navigation.

Route private dùng app shell:

- Mobile: bottom nav.
- Desktop: sidebar gồm Overview, Transactions, Budgets, Analytics, Debts; Chat AI là primary action.
- Topbar: wallet/month context, search, notifications, avatar/profile dropdown.

### 5.2 Visual system theo tinh thần Spendee

Không sao chép pixel-for-pixel. Giữ nguyên tắc:

- Nền sáng trung tính, card trắng, màu category tươi và có chủ đích.
- Green là positive/primary, coral-red là expense/danger, blue là neutral balance/info, yellow là warning.
- Mỗi màn hình có một primary action rõ ràng.
- Số tiền dùng tabular numbers, không truncate giá trị tài chính quan trọng.
- Giảm shadow; dùng hierarchy qua spacing, surface và typography.

Token cần chuẩn hóa:

- Brand/primary: `#00BC7C`.
- Expense: `#FE5A61`.
- Income: `#00BC7C`.
- Info/balance: `#40C3F9` hoặc blue đậm đạt contrast.
- Warning: `#FFC053` với foreground đủ contrast.
- Text primary: `#344554`.
- Background: `#F7F9FB`.
- Spacing scale 4/8/12/16/24/32.
- Touch target tối thiểu 44×44px.
- Focus ring rõ ràng, contrast WCAG AA, hỗ trợ reduced motion.

### 5.3 Dashboard

Vấn đề:

- Lặp tổng thu/tổng chi hai lần.
- Ba summary cards truncate số tiền trên mobile.
- Header chỉ ghi “Xin chào”, không có tên/avatar/user context.
- Không có wallet/account context.
- Empty/error state yếu; fetch fail chỉ log console.
- Không dẫn người dùng theo flow từ insight sang hành động.

Đề xuất:

- Hero: net balance + month selector + income/expense.
- Hàng insight: budget remaining, daily safe-to-spend, debt due.
- Recent transactions có filter nhanh và CTA “Thêm giao dịch”.
- Section “Cần chú ý” chỉ xuất hiện khi có budget warning/debt due/anomaly.
- Desktop: hero 8 cột + right insight rail 4 cột; transactions và spending breakdown bên dưới.

### 5.4 Login/onboarding/profile

Vấn đề:

- Login có bottom nav.
- Copy “Dữ liệu được lưu trữ riêng tư” hiện không đúng với implementation.
- Chỉ có Google; không có error/loading state rõ ràng.
- Sau login không có onboarding.

Flow đích:

1. Login.
2. Tạo/đồng bộ user.
3. Onboarding 3 bước: currency/timezone → mục tiêu → tạo giao dịch đầu tiên hoặc import.
4. Hiển thị kết quả giao dịch đầu tiên.
5. Gợi ý tạo budget dựa trên category vừa dùng.

Profile menu:

- Avatar, name, email.
- Profile & preferences.
- Currency/timezone/locale.
- Data export.
- Sign out.
- Delete account với re-auth/confirmation.

### 5.5 Transactions

Vấn đề:

- Loading chiếm gần toàn màn hình.
- Filter category là horizontal chip đơn giản; thiếu search/type/date.
- Native `confirm()` khi xóa.
- Add/edit flow trong dialog dài, chưa tối ưu keyboard/mobile.
- Không có optimistic feedback/undo.

Đề xuất:

- Mobile: sticky summary + filter sheet + FAB.
- Desktop: table/list toggle, search, multi-filter, pagination/cursor, bulk selection.
- Add transaction dùng bottom sheet mobile và dialog desktop.
- Sau lưu: cập nhật list ngay, toast có Undo.
- Empty state có CTA và ví dụ nhập AI.

### 5.6 Budgets

Vấn đề:

- Empty state ổn nhưng thiếu giải thích kết quả mong đợi.
- Month copy không preview thay đổi.
- Daily limit/frequency làm form phức tạp trước khi user hiểu budget cơ bản.

Đề xuất flow:

1. Chọn category.
2. Chọn amount/period.
3. Hiển thị daily safe-to-spend realtime.
4. Advanced limits là progressive disclosure.
5. Review và save.
6. Success state dẫn về budget detail.

Card budget cần hiển thị: spent, remaining, progress, daily allowance, dự báo vượt budget.

### 5.7 Analytics

Vấn đề:

- Một cột dữ liệu tạo bar chart gần như vô nghĩa.
- Period tabs không thể hiện rõ range.
- Thiếu comparison với kỳ trước và actionable insight.
- Desktop vẫn là panel mobile 512px.

Đề xuất:

- KPI: expense, income, net, daily average, change vs previous period.
- Trend chart phù hợp density dữ liệu.
- Category breakdown click-through về transaction filter.
- Desktop có date range, wallet/category filters và export.
- Empty/insufficient-data state giải thích cần bao nhiêu dữ liệu.

### 5.8 Chat AI

Vấn đề:

- Greeting tương phản thấp.
- Không có suggested prompts.
- AI đang ghi DB ngay sau parse; thiếu confirm/edit step nên sai AI thành sai dữ liệu.
- User Story yêu cầu cho sửa lại sau parse nhưng flow hiện không có.

Flow đích:

1. User nhập text/ảnh.
2. AI parse thành transaction draft.
3. Preview card: amount, type, category, date, note.
4. User sửa hoặc xác nhận.
5. API lưu và trả success state.
6. CTA xem giao dịch hoặc nhập tiếp.

Không gửi ảnh/key/thông tin tài chính sang dịch vụ ngoài khi chưa rõ trạng thái và consent trong UI.

### 5.9 Debts

Vấn đề:

- Có hydration error do button lồng button ở FAB mở dialog.
- Không có entry trong navigation chính dù có nhiều màn hình.
- Empty state và form chưa giải thích “tôi nợ” so với “người khác nợ tôi”.
- `creditor` không đủ biểu diễn direction.

Đề xuất:

- Thêm `direction: payable | receivable`.
- Tách due soon/overdue/active/completed.
- Debt detail có timeline payments và CTA record payment.
- Đưa Debts vào desktop sidebar và mobile More/Profile hoặc thay một nav item theo product priority.

### 5.10 Settings

Lỗi xác nhận:

- Gọi `/api/settings/stats` nhưng endpoint không tồn tại.
- UI category dùng `emoji`, API trả `icon`, nên icon không hiển thị.
- Add/delete category buttons chưa có handler.
- Export JSON chỉ toast giả.
- Gemini key chỉ ghi `localStorage`; backend đọc DB/env nên UI và backend không cùng source.
- Luôn hiển thị “Sẵn sàng” dù không test server capability.

Đích:

- Profile đứng đầu settings.
- AI connection gọi server endpoint `status/test`, không lộ key.
- Category CRUD hoạt động thật và scoped theo user.
- Export tạo file thật.
- Hiển thị trạng thái loading/error/success trung thực.

## 6. Kế hoạch triển khai

### Phase 0 — Chốt baseline và bảo vệ dữ liệu (P0, 2–3 ngày)

- Tạo backup DB và migration strategy cho 4 expense + 1 budget hiện có.
- Chọn owner cho legacy records hoặc archive chúng sang bảng backup.
- Thêm test runner và test DB tạm.
- Sửa lint errors, BigInt serialization, self-host font và `middleware` → `proxy`.
- CI bắt buộc: lint, typecheck, unit, integration, build.

Exit criteria:

- Bốn command CI pass.
- Không build phụ thuộc tải Google Fonts.
- Có rollback cho migration.

### Phase 1 — Auth/profile/data isolation (P0, 4–6 ngày)

- Typed session/user helper.
- Fail-closed auth config.
- Migration thêm `user_id`, constraints và indexes.
- Scope tất cả API reads/writes.
- Chặn IDOR bằng ownership predicates.
- User-scoped settings/categories.
- Mã hóa Gemini keys; API chỉ trả masked metadata.
- App header/profile menu/sign-out.
- Auth layout riêng, bỏ nav khỏi login.

Exit criteria:

- User A không thể list/read/update/delete dữ liệu của User B.
- API trả 401 khi unauthenticated, 404/403 đúng contract khi record không thuộc user.
- Login/logout/profile hoạt động trên mobile và desktop.
- Không API nào trả raw secret.

### Phase 2 — Design system và responsive app shell (P1, 4–5 ngày)

- Chuẩn hóa tokens, typography, spacing, icon/category colors.
- Tạo `PublicLayout` và `AppShell`.
- Mobile bottom nav + desktop sidebar/topbar.
- Content container và 12-column desktop grid.
- Shared primitives: PageHeader, Money, EmptyState, ErrorState, LoadingState, FilterBar.
- Accessibility: zoom, focus, keyboard, reduced motion, contrast.

Exit criteria:

- Không horizontal overflow ở 320, 375, 390, 768, 1024, 1280, 1440px.
- Desktop sử dụng không gian thật, không còn centered mobile column.
- Tất cả primary actions đạt touch target 44×44.

### Phase 3 — UX flow từ onboarding đến kết quả (P1, 5–7 ngày)

- Onboarding sau login.
- Transaction draft/confirm flow cho AI.
- Add/edit transaction responsive.
- Dashboard mới theo `Track → Analyze → Budget`.
- Empty/error/success/undo states.
- Month/wallet context nhất quán.

Exit criteria:

- User mới tạo giao dịch đầu tiên trong tối đa 60 giây.
- AI không ghi transaction trước khi user confirm.
- Sau mỗi action luôn có kết quả và next action rõ ràng.

### Phase 4 — Hoàn thiện từng module (P1/P2, 6–9 ngày)

- Budgets progressive form + forecast.
- Analytics comparison/filter/drill-down.
- Debts direction/status/timeline.
- Settings CRUD/export/status thật.
- Desktop bulk transaction operations.

Exit criteria:

- Không còn mock endpoint, fake timeout hoặc UI-only control.
- Mọi button có behavior, disabled state và error state.

### Phase 5 — Test tổng thể và polish (P0 trước release, 3–5 ngày)

- Unit: money/date/percentage/parser utilities.
- Integration: auth helper và toàn bộ API ownership.
- E2E: login, onboarding, CRUD transaction, AI confirm, budget, debt, settings/export.
- Visual regression: 390×844, 768×1024, 1440×900.
- Accessibility: axe + keyboard-only.
- Performance: bundle/LCP/CLS và query indexes.

Release gate:

- 0 P0/P1 open.
- Lint/typecheck/test/build pass.
- 0 cross-user data access.
- Không secret trong response/log/client storage.
- Core E2E pass trên mobile và desktop.

## 7. Backlog ưu tiên

### P0 — Block release

- User ownership migration.
- API auth + ownership checks.
- Secret handling cho Gemini keys.
- Auth fail-closed.
- Login/profile/sign-out.
- Fix lint/build/BigInt.
- Test automation cho data isolation.

### P1 — Core product quality

- Responsive app shell thật.
- Dashboard information architecture.
- AI draft/confirm.
- Onboarding.
- Transaction filters và feedback states.
- Settings behavior thật.
- Accessibility baseline.

### P2 — Nâng trải nghiệm

- Budget forecast.
- Analytics comparison/drill-down.
- Bulk edit/import.
- Debt direction và reminders.
- Dark mode.
- Shared wallet chỉ sau khi personal ownership ổn định.

## 8. Test matrix bắt buộc

| Area | Mobile | Desktop | API/DB |
|---|---|---|---|
| Auth | login/error/logout | login/profile/logout | 401, session typing, fail-closed |
| Transactions | add/edit/delete/filter | table/bulk/filter | ownership + validation |
| AI | text/image/confirm/edit | same | no pre-confirm write |
| Budgets | create/copy/progress | grid/detail | ownership + unique scope |
| Analytics | period/drill-down | filters/export | correct aggregates per user |
| Debts | create/payment/status | detail/timeline | parent/child ownership |
| Settings | profile/category/key/export | same | encrypted secrets, masked response |
| Responsive | 320/375/390/768 | 1024/1280/1440 | N/A |

## 9. Definition of Done

Một story chỉ được coi là xong khi:

- UI mobile và desktop đều hoàn chỉnh.
- Có loading, empty, error, success và disabled state phù hợp.
- Keyboard/focus/touch target đạt yêu cầu.
- API validate input và scope theo authenticated user.
- Có test tự động ở mức phù hợp.
- Lint, typecheck và build pass.
- Không còn mock hoặc TODO trong flow đó.
