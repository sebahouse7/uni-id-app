import nodemailer from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function getTransporter() {
  const host = process.env["SMTP_HOST"];
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  const from = process.env["SMTP_FROM"] ?? "uni.id <noreply@uni.id>";

  if (!host || !user || !pass) return null;

  return { transporter: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }), from };
}

export async function sendEmail(opts: MailOptions): Promise<{ sent: boolean; previewCode?: string }> {
  const config = getTransporter();
  if (!config) {
    // Dev mode: log the OTP to console (NEVER in production)
    console.warn(`[EMAIL DEV] To: ${opts.to} | Subject: ${opts.subject}`);
    console.warn(`[EMAIL DEV] Body: ${opts.text}`);
    return { sent: false, previewCode: opts.text };
  }
  await config.transporter.sendMail({ from: config.from, ...opts });
  return { sent: true };
}

export function buildRecoveryEmail(code: string, lang = "es"): { subject: string; html: string; text: string } {
  const templates: Record<string, { subject: string; body: string; footer: string }> = {
    es: {
      subject: "Código de recuperación — uni.id",
      body: `Tu código de recuperación es: <strong style="font-size:28px;letter-spacing:6px">${code}</strong><br>Válido por 10 minutos. Si no lo pediste, ignorá este mensaje.`,
      footer: "Este código es de uso único y expira en 10 minutos.",
    },
    en: {
      subject: "Recovery code — uni.id",
      body: `Your recovery code is: <strong style="font-size:28px;letter-spacing:6px">${code}</strong><br>Valid for 10 minutes. If you didn't request this, ignore this message.`,
      footer: "This code is single-use and expires in 10 minutes.",
    },
    pt: {
      subject: "Código de recuperação — uni.id",
      body: `Seu código de recuperação é: <strong style="font-size:28px;letter-spacing:6px">${code}</strong><br>Válido por 10 minutos. Se não pediu, ignore esta mensagem.`,
      footer: "Este código é de uso único e expira em 10 minutos.",
    },
  };
  const t = templates[lang] ?? templates["es"];
  return {
    subject: t.subject,
    text: `uni.id — Código de recuperación: ${code} (válido 10 min)`,
    html: `
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#060B18;color:#fff;padding:40px">
<div style="max-width:480px;margin:auto;background:#0D1525;border-radius:16px;padding:32px;border:1px solid #1A6FE8">
  <h1 style="color:#00D4FF;margin-top:0">uni.id</h1>
  <p style="font-size:16px">${t.body}</p>
  <hr style="border-color:#1A2540;margin:24px 0"/>
  <p style="color:#8899BB;font-size:13px">${t.footer}</p>
  <p style="color:#8899BB;font-size:12px">human.id labs S.A.S.</p>
</div></body></html>`,
  };
}
