# PWA: offline capture, reminders, and AI insights

## Server configuration

Web Push is sent by the Vercel cron route. Add these environment variables to the Vercel project (Production and Preview only if those deployments should send notifications):

| Variable | Value |
| --- | --- |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Public key from `web-push generate-vapid-keys` |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Private key from the same command; keep it secret |
| `WEB_PUSH_VAPID_SUBJECT` | A contact URI such as `mailto:you@example.com` |
| `CRON_SECRET` | A long random value used to authenticate the Vercel cron request |

Generate a VAPID key pair locally with:

```bash
pnpm exec web-push generate-vapid-keys
```

Generate a cron secret with:

```bash
openssl rand -base64 32
```

Keep the same VAPID key pair after deployment. Changing it invalidates existing device subscriptions; users will need to enable notifications again. The cron checks preferences every five minutes and sends reminders using `Asia/Ho_Chi_Minh`. Notification messages are intentionally generic and do not include transaction amounts.

## Enable notifications

- On iPhone/iPad, open the site in Safari, choose **Share → Add to Home Screen**, launch the installed app, then enable notifications in **Tài khoản → Cài đặt**. iOS requires the installed Home Screen web app and a direct user action before asking for notification permission.
- On supported desktop browsers, open the site and enable notifications in **Tài khoản → Cài đặt**.
- Set the daily reminder and weekly AI analysis schedule, then save. Weekly analysis uses the AI provider configured for the user's account.

The service worker caches static interface assets only. Transaction and AI-note drafts queued while offline remain in device IndexedDB until they can be sent; financial API responses are not cached.
