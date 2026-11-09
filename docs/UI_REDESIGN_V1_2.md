# UI redesign v1.2

## Visual direction

A calm, precise Vietnamese finance ledger using ARC Academy's existing identity. The interface prioritizes legible amounts, clear financial states, and dense desktop review without turning every row into a card.

## Tokens

- App surface: `#F1F5F9`; elevated surface: `#FFFFFF`; subtle surface: `#F8FAFC`.
- Ink: `#0F172A`; secondary text: `#475569`; muted text: `#64748B`.
- Primary action green: `#16A34A`; ARC lime: `#75C832` for brand marks; warning: `#D97706`; negative: `#DC2626`.
- Dividers: `#CBD5E1`; radius scale: 6 / 10 / 16px; shadows only for overlays and elevated controls.
- Be Vietnam Pro for interface copy; Space Grotesk for large financial figures, with tabular numerals.

## Layouts

- Phone (390px): bottom navigation; single-column flow; transaction/debt/budget cards; form sheet with fixed action area and scrollable fields.
- Tablet (768–1199px): compact navigation rail; two-column dashboard and analysis; cards remain where each item needs a multi-line summary; controls retain full touch targets.
- Desktop (1200px+): full sidebar and wider work area; transactions, budgets, and debts use semantic tables; summaries become compact side panels; empty states span the whole work area.

```text
Phone                 Tablet                   Desktop
┌──────────────┐      ┌─rail─┬───────────┐     ┌─sidebar─┬───────────────────────┐
│ page heading │      │      │ summary   │     │         │ filters    actions    │
│ summary      │      │      ├─────┬─────┤     │         ├───────────────────────┤
│ item card    │      │      │ card│ card│     │         │ date  desc  category  │
│ item card    │      │      │     │     │     │         │       amount  action  │
├──────────────┤      └──────┴─────┴─────┘     └─────────┴───────────────────────┘
│ bottom nav   │
└──────────────┘
```

## Interaction and form rules

- Radix primitives provide dialog, alert dialog, popover/date picker, select, tabs, menu, toast, tooltip, scroll area, and progress behavior. Keep native semantic buttons, inputs, and tables where Radix has no primitive.
- React Hook Form owns form state; Zod owns client validation; server APIs remain authoritative. Errors appear beside their fields and API failures remain visible in the form.
- Keyboard focus, reduced motion, touch target size, and Vietnamese date/money formatting are part of acceptance, not polish items.

## Review loop

Run browser journeys against a disposable local database, inspect phone/tablet/desktop screenshots, fix visible layout defects, and rerun the same journeys. Never use the configured production/remote database for visual tests.

## Browser review, 2026-11-09

- Direct Chromium run across 10 widths (320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920) and 6 primary routes (60 combinations). All routes returned 200 with no horizontal overflow after fixing the 360px budget toolbar wrap.
- Confirmed the transaction page shows card groups through 1024px and switches to the table at 1280px; desktop screenshots show the full date/category/description/note/amount/actions columns.
- Opened manual transaction dialog and date picker on phone, verified inline Zod validation, and exercised budget and debt form validation. No browser runtime errors during these interactions.
- TypeScript and `git diff --check` pass. Browser session used an already-running local development server; no create/save actions were submitted in this review run.

## Follow-up visual corrections

- Switched primary actions and selected/focus states to ARC green; replaced the dark logo tile with the ARC mark on white and renamed the lockup to “ARC Irobot / Quản lý chi tiêu”.
- Fixed Radix select item layout so category icons and names stay on one line. The edit dialog now retains the transaction’s selected category after categories load.
- Added edit actions to transaction cards and desktop rows; the existing `PUT /api/expenses/:id` now validates category/date/amount and persists type as well.
- Reworked debt summary into a three-metric strip, expanded the desktop table work area, and moved “Thêm khoản nợ” into the desktop header while retaining the phone FAB.
- Rechecked 42 route/viewport combinations after these changes; no overflow or runtime errors. Opened edit forms at phone and desktop sizes and confirmed the existing “Xe & xăng” category is prefilled. No save was submitted.
