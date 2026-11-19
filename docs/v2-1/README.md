# Tài liệu Quy hoạch & Đặc tả Nghiệp vụ — ARC Irobot v2.1 (SaaS Evolution)

> **Trạng thái**: Draft for Sign-off (Chờ ĐẠI CA duyệt trước khi code Sprint 1)  
> **Baseline hiện tại**: `v1.2.2` (`SCHEMA_VERSION = '2026-11-18-v1'`)  
> **Nhịp triển khai**: 1 tuần / Sprint (6 Sprints: v2.0 Foundation & Core Personas → v2.1 Collaboration & Pro)  
> **Hạ tầng hiện tại**: Vercel (Fluid Compute, `hnd1`) + Turso (`libSQL`) + GitHub Actions Cron *(kiến trúc sẵn sàng chuyển dịch sang Server vật lý tự vận hành)*

---

## 1. Cấu trúc thư mục tài liệu (theo quy trình BA → Architecture → Delivery)

```text
docs/v2-1/
├── README.md                          # Tổng quan bộ tài liệu & checklist sign-off
├── 01-business/
│   ├── BRD.md                         # Mục tiêu kinh doanh SaaS, Phạm vi v2.0/v2.1, KPIs & Rủi ro
│   └── PERSONAS_AND_MODULES.md        # 6 phân loại người dùng, Ma trận Onboarding & Module Flags
├── 02-requirements/
│   ├── USER_STORIES.md                # Epics, User Stories & Acceptance Criteria (BDD)
│   └── UX_FLOWS_AND_SCREENS.md        # Wireflows, Onboarding, Unified Chat, Progressive Disclosure, PWA/Offline
├── 03-architecture/
│   ├── SRS_AND_SYSTEM_DESIGN.md       # Kiến trúc hệ thống, Bug Baseline v1.2.2, Bảo mật, Mail (Nodemailer), Physical Server Readiness
│   ├── DATABASE_AND_MIGRATION.md      # ERD, Full SQLite/libSQL Schema & Chiến lược Migration an toàn từ v1.2.2
│   └── API_AND_AI_CONTRACTS.md        # Đặc tả API (Zod, DTO, Error Codes), Shortcuts API, AI Intent Router, Fast-Path 0ms & Whisper
└── 04-delivery/
    ├── SPRINT_PLAN.md                 # Lộ trình 6 Sprint (1 tuần/Sprint), Mục tiêu & Tiêu chí nghiệm thu từng Sprint
    └── TASK_BREAKDOWN.md              # Danh sách Task chi tiết (DB / BE / FE / Test), File tác động & Definition of Done
```

---

## 2. Thứ tự đọc & Phê duyệt (Sign-off Checklist)

| Bước | Tài liệu | Mục đích rà soát | Trạng thái |
| :--- | :--- | :--- | :--- |
| 1 | [01-business/BRD.md](./01-business/BRD.md) | Chốt tầm nhìn SaaS, phạm vi v2.0 vs v2.1, ràng buộc hạ tầng | Chờ duyệt |
| 2 | [01-business/PERSONAS_AND_MODULES.md](./01-business/PERSONAS_AND_MODULES.md) | Chốt 6 phân khúc người dùng, flow Onboarding & bật/tắt module trong Settings | Chờ duyệt |
| 3 | [02-requirements/USER_STORIES.md](./02-requirements/USER_STORIES.md) | Chốt User Stories và Acceptance Criteria cho QA/Dev | Chờ duyệt |
| 4 | [02-requirements/UX_FLOWS_AND_SCREENS.md](./02-requirements/UX_FLOWS_AND_SCREENS.md) | Chốt luồng màn hình, gộp `/chat`, xử lý offline & recurring confirm | Chờ duyệt |
| 5 | [03-architecture/SRS_AND_SYSTEM_DESIGN.md](./03-architecture/SRS_AND_SYSTEM_DESIGN.md) | Chốt xử lý toàn bộ bug baseline v1.2.2, Auth/Mail/Rate-limit, đường nâng cấp Server vật lý | Chờ duyệt |
| 6 | [03-architecture/DATABASE_AND_MIGRATION.md](./03-architecture/DATABASE_AND_MIGRATION.md) | Chốt ERD, bảng mới (`accounts`, `recurring_rules`, `ledgers`, `tags`, `shortcut_keys`...) & script migrate | Chờ duyệt |
| 7 | [03-architecture/API_AND_AI_CONTRACTS.md](./03-architecture/API_AND_AI_CONTRACTS.md) | Chốt payload API, Fast-Path 0ms, AI Q&A, Whisper & Shortcuts Webhook | Chờ duyệt |
| 8 | [04-delivery/SPRINT_PLAN.md](./04-delivery/SPRINT_PLAN.md) & [TASK_BREAKDOWN.md](./04-delivery/TASK_BREAKDOWN.md) | Chốt phân bổ Sprint 1–6 (1 tuần/Sprint) trước khi bắt đầu code Sprint 1 | Chờ duyệt |
