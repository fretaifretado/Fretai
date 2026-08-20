import crypto from "crypto";

function requiredEmailConfig(): { apiKey: string; from: string; frontendUrl: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const missing = [
    !apiKey && "RESEND_API_KEY",
    !from && "PASSWORD_RESET_FROM",
    !frontendUrl && "FRONTEND_URL",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Configuração de recuperação de senha ausente: ${missing.join(", ")}`);
  }

  const parsedFrontendUrl = new URL(frontendUrl!);
  if (parsedFrontendUrl.protocol !== "http:" && parsedFrontendUrl.protocol !== "https:") {
    throw new Error("FRONTEND_URL deve usar http ou https");
  }

  return { apiKey: apiKey!, from: from!, frontendUrl: parsedFrontendUrl.origin };
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const config = requiredEmailConfig();
  const baseUrl = config.frontendUrl.replace(/\/+$/, "");
  const resetUrl = `${baseUrl}/login?resetToken=${encodeURIComponent(token)}`;
  const idempotencyKey = crypto.createHash("sha256").update(token).digest("hex");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `password-reset-${idempotencyKey}`,
      "User-Agent": "Fretai/1.0",
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: "Redefinição de senha - Fretai",
      html: `
        <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5;max-width:560px;margin:auto">
          <h1 style="font-size:22px">Redefinição de senha</h1>
          <p>Recebemos uma solicitação para redefinir sua senha na Fretai.</p>
          <p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Redefinir senha</a></p>
          <p style="font-size:13px;color:#667085">Este link expira em 1 hora. Se você não fez esta solicitação, ignore este e-mail.</p>
        </div>
      `,
      text: `Redefina sua senha da Fretai acessando: ${resetUrl}\n\nEste link expira em 1 hora.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha no envio do e-mail de recuperação (HTTP ${response.status})`);
  }
}
