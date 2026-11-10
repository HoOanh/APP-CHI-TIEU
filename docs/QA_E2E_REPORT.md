# ARC Irobot — QA/QC E2E report

**Date:** 2026-11-10  
**Branch:** `feat/pwa-daily-capture-reminders`  
**Initial result:** **FAIL / no-go** on the first E2E pass. Three debt defects were fixed and retested during release preparation; personal-provider generation remains a release risk.

## Test setup and limits

- Ran the application UI and its real Next.js API routes in Chromium 1.65 with Playwright.
- Viewports: desktop 1440×900, tablet 834×1112, mobile 390×844.
- Used a temporary SQLite database at `/tmp/arc-irobot-qa-20261110.sqlite`. No test transaction, provider, reminder, or debt data was written to the configured Turso database.
- Used the Gemini key from `.env.local` without printing or retaining it in this report. The temporary provider was removed after testing; the QA server was stopped and the temporary SQLite database and export file were deleted after the run.
- The visible browser control host was unavailable. Browser coverage therefore used real headless Chromium, with screenshots saved under `artifacts/qa-e2e-2026-11-10/`.
- Local OAuth credentials are empty in `.env.local`; the UI ran as `Local Developer`. The login screen was checked, but a Google sign-in could not be completed in this environment.
- Web Push permission was denied by the headless browser, so an actual push delivery to an installed device was not verified. Subscription API CRUD and cron authentication were verified.

## Case results

| ID | Flow | Result | Evidence / finding |
|---|---|---|---|
| AUTH-01 | Open login screen | PASS | Login page renders at desktop, tablet, and mobile. Google OAuth completion is blocked because `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are empty locally. |
| NAV-01 | Open home, expenses, planning, debts, debt detail, quick transaction, debt AI, settings, and stats | PASS | All 10 routes returned HTTP 200 at all three viewports. See screenshots below. |
| UI-01 | Responsive layout and horizontal overflow | PASS | 30/30 route/viewport combinations had document width equal to viewport width. Desktop expenses and budgets render tables; mobile renders transaction and budget cards. Tablet uses the compact desktop navigation. |
| UI-02 | Manual transaction, budget, and debt modals on mobile | PASS | All three fit within 390×844 without clipping. Manual: 366×701; budget: 357×644; debt: 342×642. |
| EXP-01 | Empty form validation, amount formatting, category name, date picker | PASS | Empty transaction form shows validation; `100000` displays as `100.000`; selecting a category shows its name; date picker selected 09/11/2026 correctly. |
| EXP-02 | Create expense, edit it, and delete it | PASS | Created and edited a test expense; edit retained its date; delete removed it from the API result. |
| EXP-03 | Create income | PASS | Income type selected `Thu nhập`; 2.000.000đ appeared in income and net balance totals. |
| EXP-04 | Create transaction from AI draft, date parsing, confirm and save | PASS | Fallback AI parsed 31.000đ with today 10/11/2026 and 42.000đ with explicit 09/11/2026. Both drafts were confirmed and appeared once in the transaction API. |
| BUD-01 | Create monthly budget and view category | PASS | 4.000.000 displayed as `4.000.000`; the selected category is shown by name. |
| BUD-02 | Create daily budget, default days, and custom days | PASS | 100.000đ/day defaulted to 30 days in November and 3.000.000đ total. Editing to 28 days recalculated to 2.800.000đ. |
| BUD-03 | Import JSON and copy previous month | PASS | JSON import returned HTTP 200. Copying November to December changed the daily budget from 28 to 31 days and recalculated its total to 3.100.000đ. |
| BUD-04 | Open advanced budget limits | PASS | Daily spending ceiling and transaction-frequency controls opened and were visible. |
| DEBT-01 | Create debt and open debt detail | PASS | 1.111.111đ debt saved with a 19/11/2026 due date; summary and detail reflected it. |
| DEBT-02 | Record a manual debt payment | **FIXED / PASS retest** | Initial `POST /api/debts/1/payments` returned 500 because `payment_date` was omitted. Retest: API defaults the date to Vietnam today; payment returned 201 and stored `2026-11-10`. Amount 0 is rejected with 400. |
| DEBT-03 | Save debt repayment savings jar | **FIXED / PASS retest** | Initial page sent `target_amount` while API expected `planned_amount`. Retest: correctly named field returned 201 and GET returned the saved jar. |
| DEBT-04 | Repay debt through AI chat | **FIXED / PASS retest** | Initial AI result inserted a 0đ payment and reported success. The chat form now sends the field the API parses. Chromium retest submitted “Trả Debt Chat UI QA 100k”; API returned 201 and stored one 100.000đ payment dated 10/11/2026. Missing amount returned 422 and left payment count at zero. |
| AI-01 | Add personal Gemini provider using the `.env.local` key; verify and discover models | PASS / PARTIAL | Provider creation returned 201, verification returned 200, and discovery returned 47 models. A model could be selected, enabled, and set as default. |
| AI-02 | Generate text with the personal provider model | **FAIL — P1 / external API** | `gemini-2.5-flash` returned HTTP 404 because Google no longer serves it to new users. `gemini-3.8-flash` returned HTTP 503. The discovery list included a model that could not generate. |
| AI-03 | Quick transaction AI using server fallback; weekly AI insight | PASS | Fallback AI parsed and saved transactions with correct dates. Weekly insight generation returned HTTP 200 and rendered. When the personal provider failed, quick chat showed the generic English text `Failed to process chat`. |
| AI-04 | Weekly insight formatting | **FIXED / PASS retest** | Dashboard now strips unsupported Markdown markers before rendering insight text. |
| CAT-01 | Create and delete a custom category | PASS | Create returned HTTP 201; delete returned HTTP 200 and removed the category. |
| PWA-01 | Save and read daily/weekly reminder preferences | PASS | PUT returned HTTP 200; GET returned the selected times, weekday, and `Asia/Ho_Chi_Minh`. |
| PWA-02 | Push subscription API create/read/delete | PASS | API CRUD returned 200 using a QA subscription in the isolated database. |
| PWA-03 | Subscribe through browser permission prompt and receive push | BLOCKED | Headless Chromium reports notification permission denied; `PushManager.subscribe` returned `AbortError: permission denied`. No real device push was sent. |
| PWA-04 | Cron authentication | PASS | No secret returned 401; the QA secret returned 200. No notification was due during the run. |
| PWA-05 | Offline AI note capture | PASS | Text note remained in IndexedDB; after reconnect it could be moved back into the AI input and deleted from the queue. |
| PWA-06 | Offline manual transaction capture and retry | **FAIL — P2** | On a fresh chat-page load while offline, the category request fails, leaving no category options and disabling “Lưu giao dịch.” After opening the form online once, the same offline capture queued and synced on reconnect. Replaying its idempotency key returned 200 and left one database row. |
| PWA-07 | Clear cached assets without clearing user data | PASS | Cache contained `arc-irobot-static-v2` before and no ARC cache afterward; the three QA transactions remained in SQLite. |
| DATA-01 | Export data JSON | PASS | Browser download completed as `chi-tieu-export-2026-11-10.json`; exported JSON parsed and contained the expected top-level data sections. |
| STATS-01 | Switch monthly, yearly, quarterly, and five-year statistics | PASS | All period tabs became selected and rendered. |

## Defects and remediation

### P1 — Debt workflows can lose or misrepresent payments

1. **FIXED — Manual payment date and error handling.** The form now sends Vietnam's current date and the API safely defaults it when omitted. The API validates amount/date; failed saves show feedback.
2. **FIXED — Debt jar field mismatch.** The page now sends `planned_amount`, matching the API, and failed saves show feedback.
3. **FIXED — AI debt chat request and zero payment.** The UI now posts the `message` field expected by the API. The API validates debt name and requires `amount > 0`; invalid extraction returns a Vietnamese 422 without inserting a payment.
4. **Personal Gemini model selection does not ensure generation works.** Model discovery surfaced `gemini-2.5-flash`, but generation returned 404 for this key. The model verification action only checked provider connectivity. Validate a selected model with a minimal generation call or filter/mark unavailable models; surface the provider's actual error in the UI.

### P2 — Offline and input defaults

5. **Fresh offline manual entry has no categories.** Cache the user's category list for offline form startup or provide a deliberate local fallback. Do not disable saving when a valid cached category is available.
6. **Manual expense form defaults to `AI`.** The first alphabetic expense category is selected automatically. Start with no selection or a sensible common category, and require deliberate selection when appropriate.
7. **FIXED — Weekly insight Markdown markers.** The card strips unsupported emphasis and heading markers before displaying the generated text.
8. **AI failure text falls back to English.** `Failed to process chat` appears in the Vietnamese transaction chat when a personal provider fails; expose a Vietnamese message that explains the provider/model failure.

## QA conclusion

- **Release decision: CONDITIONAL.** Debt payment, debt jar, zero-payment rejection, and insight formatting were corrected and retested; TypeScript, production build, and unit tests pass. Lint has warnings but no errors. Personal Gemini-provider generation returned 404/503 for the selected models, while server fallback AI worked. This remains an observed provider/model risk; actual push delivery also remains unverified on a real installed device.
- **Responsive visual result:** the inspected pages preserve separate desktop/tablet/mobile behavior, and the tested list pages switch from desktop tables to mobile cards. No horizontal overflow was observed at the tested widths. The insight card's raw Markdown display was corrected; the manual transaction form still defaults to the `AI` category.
- **Environment gaps:** Google OAuth could not be completed because local OAuth credentials are absent; real push delivery could not be verified because headless Chromium denied notifications. The tests used the real app/API code against an isolated SQLite database, not the configured Turso database.
- **Coverage limit:** every primary route and the key create/edit/delete flows listed above were exercised. The report does not claim coverage of every possible provider model, browser/OS combination, notification permission state, or every unlisted secondary control.

## Release deployment note

- The first Vercel production deployment was rejected because this project is on Hobby and Vercel limits Hobby cron jobs to once per day; the app needs a five-minute dispatch interval for configured reminders.
- The schedule was moved to a GitHub Actions workflow every five minutes. This repository is public, so standard GitHub-hosted runner usage is free. GitHub notes scheduled runs can be delayed under load and public-repository schedules are disabled after 60 days without repository activity; keep this limitation in mind for time-sensitive reminders. See [GitHub workflow schedule syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [scheduled event behavior](https://docs.github.com/en/enterprise-cloud%40latest/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- Production now has `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `CRON_SECRET` configured. The matching cron secret is stored as a GitHub Actions secret. Secret values are intentionally omitted.
- The proxy now lets only `/api/cron/pwa-reminders` reach its own `CRON_SECRET` check without a user session. Local production-mode proxy retest returned 401 without/with a wrong secret and 200 with the valid secret; other API routes remain behind session authentication.

## Visual evidence

### Screens

- [Desktop home](../artifacts/qa-e2e-2026-11-10/desktop-home.png), [mobile home](../artifacts/qa-e2e-2026-11-10/mobile-home.png)
- [Desktop transactions table](../artifacts/qa-e2e-2026-11-10/desktop-expenses.png), [mobile transaction cards](../artifacts/qa-e2e-2026-11-10/mobile-expenses.png)
- [Desktop budget table](../artifacts/qa-e2e-2026-11-10/desktop-planning.png), [mobile budget cards](../artifacts/qa-e2e-2026-11-10/mobile-planning.png)
- [Desktop settings](../artifacts/qa-e2e-2026-11-10/desktop-settings.png), [mobile settings](../artifacts/qa-e2e-2026-11-10/mobile-settings.png)
- [Mobile manual transaction modal](../artifacts/qa-e2e-2026-11-10/mobile-modal-manual.png), [budget modal](../artifacts/qa-e2e-2026-11-10/mobile-modal-budget.png), [debt modal](../artifacts/qa-e2e-2026-11-10/mobile-modal-debt.png)

All route/viewport screenshots are in [artifacts/qa-e2e-2026-11-10](../artifacts/qa-e2e-2026-11-10/).
