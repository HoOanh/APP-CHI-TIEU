import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM?.trim() || user || 'ARC Irobot <no-reply@chi-tieu.local>';

  if (!host || !user || !pass) return null;
  return { host, port, secure, user, pass, from };
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const config = getSmtpConfig();
  if (!config) return null;

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  return cachedTransporter;
}

export function isMailerConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = getSmtpConfig();
  const transporter = getTransporter();

  if (!config || !transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[mailer:dev-fallback] To=${to} | Subject="${subject}"\n${text}`);
      return { delivered: false, devLogged: true };
    }
    throw new Error('Dịch vụ gửi email (SMTP) chưa được cấu hình trên máy chủ.');
  }

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html,
  });

  return { delivered: true, devLogged: false };
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const displayName = name.trim() || 'bạn';
  const subject = 'Đặt lại mật khẩu — ARC Irobot';
  const text = [
    `Xin chào ${displayName},`,
    '',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu tài khoản ARC Irobot của bạn.',
    `Mở liên kết sau để tạo mật khẩu mới (hết hạn sau 30 phút): ${resetUrl}`,
    '',
    'Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <p style="font-size: 13px; font-weight: 700; color: #00a970; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 8px;">ARC Irobot</p>
      <h1 style="font-size: 20px; margin: 0 0 16px;">Đặt lại mật khẩu</h1>
      <p style="font-size: 14px; line-height: 1.6;">Xin chào <strong>${escapeHtml(displayName)}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6;">Nhấn nút bên dưới để đặt lại mật khẩu tài khoản của bạn. Liên kết có hiệu lực trong <strong>30 phút</strong> và chỉ dùng được một lần.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #00bc7c; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 22px; border-radius: 10px;">
          Đặt lại mật khẩu
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; word-break: break-all;">Nếu nút không hoạt động, hãy dán đường dẫn sau vào trình duyệt:<br/>${escapeHtml(resetUrl)}</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">Nếu bạn không thực hiện yêu cầu này, bạn có thể an toàn bỏ qua email.</p>
    </div>
  `;

  return sendMail({ to, subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
