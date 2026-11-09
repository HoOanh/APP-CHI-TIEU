# Kế hoạch nâng cấp v1.2

Nhánh: `feat/v1-2-responsive-finance`

## Mục tiêu

Sửa đúng các lỗi chức năng được báo (ngày giao dịch do AI nhận sai, không tạo được công nợ, lựa chọn/nhập tiền ngân sách), bổ sung ngân sách tính theo ngày, cấu hình AI/provider/model riêng cho từng tài khoản, thêm form giao dịch thủ công bên cạnh nhập nhanh bằng AI, và thiết kế lại bố cục theo từng nhóm thiết bị. Điện thoại là chuẩn thao tác nhanh; tablet và desktop có cấu trúc riêng, tận dụng không gian rộng thay vì phóng lớn một khung mobile.

## Phát hiện trong source hiện tại

- AI trả ngày từ prompt ở `src/lib/gemini.ts`; không truyền ngày hiện tại hoặc múi giờ Việt Nam vào prompt. Giá trị dự phòng dùng `toISOString()` (UTC). Bản nháp chat cho phép sửa nội dung nhưng chưa có điều khiển ngày. `POST /api/expenses` nhận `expense_date` và có dự phòng ngày hiện tại, nhưng dự phòng cũng dựa UTC.
- `debts.start_date` là `NOT NULL`; form `src/app/debts/page.tsx` không gửi `start_date`, trong khi API insert trực tiếp giá trị này. Đây là nguyên nhân cụ thể làm lệnh tạo công nợ thất bại. API hiện chỉ log lỗi và trả thông báo chung.
- Form ngân sách đưa `category.id` làm value của Base UI Select và để `SelectValue` tự suy ra nội dung hiển thị; cần render rõ tên/icon theo category đang chọn để không lộ ID. Số tiền dùng `<input type="number">`, không định dạng có dấu phân cách khi gõ.
- Schema ngân sách chỉ có `budget_amount` theo tháng và unique `(user_id, category_id, month)`. Hỗ trợ ngân sách theo ngày nên vẫn giữ một ngân sách/danh mục/tháng, lưu rõ cách nhập và số ngày áp dụng để tổng có thể kiểm tra/tính lại.
- `AppShell` đã có sidebar desktop từ md, nhưng các trang chính tự khóa `max-w-lg` (ví dụ giao dịch, ngân sách, công nợ); vì vậy desktop chỉ có một cột hẹp và nhiều vùng trống. Cần layout riêng theo breakpoint, không chỉ bỏ giới hạn chiều rộng.
- Settings hiện lưu riêng tối đa hai Gemini API keys cho user, nhưng model priority và provider bị hard-code trong `src/lib/gemini.ts`. Không có cấu hình endpoint/model/test connection theo tài khoản.
- `src/app/chat/page.tsx` hiện là luồng nhập nhanh qua AI; không có form tạo giao dịch trực tiếp dù `POST /api/expenses` đã nhận dữ liệu transaction.

## Phạm vi và thứ tự thực hiện

### 1. Chốt quy tắc ngày giao dịch

- Tạo hàm ngày hiện tại theo `Asia/Ho_Chi_Minh`; dùng chung ở prompt AI, chuẩn hóa bản nháp và API lưu.
- Khi người dùng nói ngày, truyền ngày/tháng/năm tham chiếu rõ ràng cho mô hình và yêu cầu hiểu định dạng tiếng Việt `d/M` hoặc `dd/MM` theo năm hiện tại; nếu không nêu ngày thì dùng hôm nay.
- Kiểm tra ngày AI trả về có hợp lệ; ngày thiếu/sai định dạng phải rơi về hôm nay thay vì tin ngày không hợp lệ.
- Bổ sung chọn ngày ở từng giao dịch nháp trước xác nhận. Mặc định hiện ngày do AI xác định; người dùng có thể sửa. Ngày được sửa phải đi cùng payload lưu và khi sửa nội dung bằng AI không bị ghi đè nếu người dùng không yêu cầu đổi ngày.
- Tiêu chí nghiệm thu: “ăn sáng + cafe” không nêu ngày được gán ngày Việt Nam hiện tại; “hôm nay 9/11” lưu đúng 9 tháng 11 của năm phù hợp; chọn ngày khác trong draft thì API lưu đúng ngày đó.

### 2. Khôi phục tạo công nợ

- Form gửi `start_date` (mặc định hôm nay) và API xác thực `name`, `creditor`, `total_amount > 0`, `start_date`, ngày hạn hợp lệ, lãi suất không âm trước insert.
- Chuẩn hóa lỗi API thành phản hồi có thông tin đủ để UI hiển thị; giữ chi tiết SQL trong server log.
- Hiển thị lỗi trả về trong toast, tránh trạng thái thất bại chung gây khó chẩn đoán.
- Tiêu chí nghiệm thu: tạo mới khoản nợ hợp lệ ghi đủ ngày bắt đầu/ngày hạn; dữ liệu thiếu hoặc sai bị chặn có thông báo; khoản vừa tạo xuất hiện trong danh sách.

### 3. Sửa form và mô hình ngân sách

- Select hiển thị tên + icon danh mục ở cả trạng thái đã chọn lẫn danh sách; payload vẫn gửi ID.
- Thay nhập số bằng VND có phân cách hàng nghìn khi gõ (ví dụ `100000` → `100.000` theo locale vi-VN), nhưng serialize thành số nguyên ở API; hỗ trợ sửa/xóa giữa chuỗi và paste.
- Thêm lựa chọn “Theo tháng” / “Theo ngày”. Theo ngày: nhập mức/ngày, số ngày mặc định bằng số ngày lịch của tháng đang chọn, cho sửa số ngày; tổng ngân sách = mức/ngày × số ngày. Cập nhật preview tổng ngay khi nhập.
- Giữ `daily_limit` hiện tại với ý nghĩa trần chi trong một ngày, tách nhãn/field khỏi “mức ngân sách mỗi ngày” để không nhập nhằng.
- Migration cộng cột basis (monthly/daily), daily amount và số ngày áp dụng; record cũ được giữ nguyên như monthly budget. API create/update/import/copy và các tổng hợp tiếp tục dùng tổng `budget_amount` làm nguồn tương thích.
- Tiêu chí nghiệm thu: category chọn hiện đúng tên; nhập `100000` lưu 100000; mức/ngày 100000 × 30 ngày preview/lưu 3000000; tháng 28/29/30/31 ngày lấy mặc định phù hợp; ngày tùy chỉnh được giữ khi mở sửa/copy.

### 4. Bố cục đa thiết bị / mobile-first

- Mobile (<768px): một cột, điều khiển đủ vùng chạm, bottom navigation và form tối ưu thao tác một tay.
- Tablet (768–1199px): navigation rail/sidebar phù hợp, trang giao dịch và ngân sách có thể dùng hai cột; giữ vùng nội dung cân đối.
- Desktop (≥1200px): sidebar cố định, header và nội dung có chiều rộng tối đa hợp lý; tổng quan dùng lưới nhiều cột; giao dịch dùng bảng/list rộng có bộ lọc; ngân sách có tổng quan và lưới hũ; công nợ có summary và bảng/card phù hợp.
- Gỡ các `max-w-lg` đặt cứng tại từng page và thay bằng container/grid theo breakpoint. Chat vẫn có chiều rộng đọc tối ưu ở vùng hội thoại trong khi khung ứng dụng tận dụng desktop.
- Kiểm tra layout tại 390px, 768px, 1024px và 1440px: không tràn ngang, không thu nhỏ desktop thành bản mobile, nav không che nội dung, dialog/form cuộn được, số tiền không bị cắt.
- Không khóa pinch zoom trong viewport metadata.

### 5. Quản lý AI theo từng tài khoản

- Dùng mô hình provider card/form như Arc Academy: mỗi tài khoản tự thêm/sửa/bật/tắt provider, kiểm tra kết nối, quản lý danh sách model và chọn model mặc định. Tận dụng ý tưởng presets, model discovery, verify và hint key; không sao chép cấu trúc backend NestJS hoặc quyền quản trị của Arc Academy.
- Hỗ trợ Gemini native và provider tương thích OpenAI Chat Completions với base URL tùy chỉnh (ví dụ OpenRouter/DeepSeek/gateway riêng). Đưa protocol adapter vào server; toàn bộ secret chỉ được gửi tới server và được mã hóa at rest theo cơ chế hiện tại.
- API chỉ trả trạng thái đã cấu hình và hint cuối của key; không bao giờ trả key gốc. Cho phép thay key mà không đọc lại key cũ. Xác thực endpoint HTTPS và chặn địa chỉ loopback/private trước khi gọi verify/discover để tránh SSRF.
- Lưu provider/model theo `user_id`; mỗi tài khoản có provider hoạt động và model mặc định riêng. API gọi AI phải lấy cấu hình của đúng user, không dùng model hard-code. Migration giữ cấu hình Gemini env làm fallback chuyển tiếp cho tài khoản chưa cấu hình, nhưng ưu tiên cấu hình cá nhân; UI chỉ rõ đang dùng cấu hình cá nhân hay fallback.
- UI Settings: preset provider, tên hiển thị, protocol, base URL, API key, verify connection, discover/import model, bật/tắt model, chọn model mặc định và trạng thái an toàn. Error thông báo ngắn, không lộ body/secret upstream.
- Tiêu chí nghiệm thu: user A/B không nhìn thấy cấu hình hoặc model của nhau; test kết nối và discovery lưu đúng provider; xóa/thay key có hành vi rõ; đổi model trong Settings làm thay đổi model gọi AI cho chat text và ảnh (nếu model/provider hỗ trợ ảnh); key không xuất hiện trong response, log ứng dụng hoặc URL.

### 6. Giao dịch thủ công

- Từ màn hình Giao dịch/ghi nhanh, có hai hành động rõ ràng: “Ghi bằng AI” và “Nhập thủ công”. Form thủ công cho phép chọn loại thu/chi, số tiền, mô tả, danh mục, ngày (mặc định hôm nay theo Việt Nam), ghi chú; không phụ thuộc cấu hình AI.
- Dùng chung validation và API `/api/expenses` cho cả form tay lẫn draft AI để không lệch quy tắc lưu. Số tiền định dạng VND khi nhập và gửi dạng số; ngày có thể chỉnh trước lưu.
- Mobile dùng form sheet/dialog dễ thao tác một tay; tablet/desktop hiển thị dialog hoặc panel phù hợp vùng làm việc. Sau lưu đóng form, cập nhật danh sách/tổng và báo lỗi API chính xác.
- Tiêu chí nghiệm thu: tạo được thu và chi bằng tay không cần API key; danh mục phụ thuộc loại giao dịch; thiếu số tiền/mô tả/danh mục bị chặn; ngày và ghi chú được lưu đúng; không tạo trùng khi submit liên tiếp.

## Cách triển khai

1. Đọc hướng dẫn Next.js 16.2.12 trong `node_modules/next/dist/docs/` cho route handlers, metadata/viewport và quy ước component trước khi sửa code.
2. Sửa logic/API ngày và công nợ; sau đó làm chọn ngày cho draft AI và form nhập giao dịch thủ công, dùng chung contract lưu.
3. Cập nhật schema migration/API ngân sách; hoàn thiện category Select, định dạng tiền và tổng theo ngày.
4. Thêm schema, mã hóa, API và provider adapters theo user; chuyển gọi AI từ model hard-code sang cấu hình cá nhân, thêm UI quản lý provider/model.
5. Refactor app shell và các page theo mobile/tablet/desktop; giữ nguyên API nghiệp vụ ngoài phần thay đổi đã nêu.
6. Đối chiếu tiêu chí nghiệm thu, kiểm tra type/lint/build và walkthrough UI ở bốn kích thước. Ghi lại kiểm tra và các sai lệch còn lại.

## Ngoài phạm vi của nhánh này

Thay đổi auth, data ownership, onboarding, import/export, hoặc redesign toàn bộ thương hiệu. Các việc này xuất hiện trong audit tổng thể nhưng không cần thiết để giải quyết yêu cầu v1.2 hiện tại.

## Trạng thái sau E2E

- `./node_modules/.bin/tsc --noEmit` và `git diff --check`: đạt.
- E2E trên database tạm: tạo giao dịch thủ công (201), công nợ (201), ngân sách 100.000đ/ngày × 30 ngày (lưu 3.000.000đ), provider và model cá nhân thành công.
- Đã mở 7 trang chính ở 390, 768, 1024 và 1440 px (28 lượt tải): không tràn ngang hoặc lỗi runtime. Rà ảnh PC và sửa bố cục số dư ở trang giao dịch cùng empty state ở công nợ/thống kê.
- Chưa gọi API AI upstream hoặc kiểm chứng kết quả model thật; E2E dùng key giả và database tạm, không ghi dữ liệu vào database cấu hình trong `.env.local`.

## Rà soát thiết kế và browser bổ sung

- Thay toàn bộ dependency Base UI và `shadcn` bằng `radix-ui`; các input/button giữ semantic native với style dùng chung vì Radix không có primitive cho text input/button. Dialog, alert dialog, select, tabs, menu, popover/date picker, toast, tooltip, progress và scroll area dùng Radix.
- Bổ sung desktop table cho giao dịch, ngân sách và công nợ; các danh sách card giữ cho phone/tablet. RHF + Zod quản lý form giao dịch tay, ngân sách, tạo công nợ, thanh toán/hũ công nợ và provider AI.
- Đổi logo app và favicon sang ARC Academy; dùng Be Vietnam Pro + Space Grotesk, thiết lập token/spacing và viết định hướng UI trong `docs/UI_REDESIGN_V1_2.md`.
- Rà Chromium trực tiếp trên 60 tổ hợp (6 route × 10 viewport 320–1920px). Lần đầu phát hiện trang ngân sách tràn ngang 6px tại 360px; toolbar đã chuyển wrap và lần chạy lại không còn tràn.
- Xác nhận mobile/tablet hiển thị card và từ 1280px trở lên hiển thị bảng giao dịch. Mở form giao dịch/date picker và kiểm tra lỗi validation cho giao dịch, ngân sách, công nợ; không lưu dữ liệu trong lượt rà hình ảnh này.
- `tsc --noEmit` và `git diff --check` đạt. Chưa gọi upstream AI thật.
