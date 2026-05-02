import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, passwordResetTokensTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { signAdminToken, signToken } from "../middlewares/auth";
import { logLogin, logAudit } from "../services/audit";

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Fretai@2027";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/* ── Platform admin login (env-based) ── */
router.post("/auth/admin/login", (req, res) => {
  const username = ((req.body as { username?: string }).username ?? "").trim();
  const password = ((req.body as { password?: string }).password ?? "").trim();

  if (!username || !password) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" }); return;
  }
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Usuário ou senha inválidos" }); return;
  }
  const token = signAdminToken(username);
  res.json({ token, username, role: "platform_admin" });
});

/* ── User login (DB-based, com bcrypt + rate limiting) ── */
router.post("/auth/login", async (req, res) => {
  const email = ((req.body as { email?: string }).email ?? "").trim().toLowerCase();
  const password = ((req.body as { password?: string }).password ?? "").trim();
  const ip = String((req as { ip?: string }).ip ?? "unknown");
  const userAgent = req.headers["user-agent"] ?? "unknown";

  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios" }); return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (!user) {
      await logLogin({ email, success: false, ip, userAgent });
      res.status(401).json({ error: "Credenciais inválidas" }); return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Conta desativada" }); return;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `Conta bloqueada. Tente novamente em ${mins} minuto(s).` }); return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failed = (user.failedAttempts ?? 0) + 1;
      const upd: Record<string, unknown> = { failedAttempts: failed };
      if (failed >= MAX_FAILED) upd.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      await db.update(usersTable).set(upd).where(eq(usersTable.id, user.id));
      await logLogin({ userId: user.id, email, success: false, ip, userAgent });
      res.status(401).json({ error: "Credenciais inválidas" }); return;
    }

    await db.update(usersTable).set({ failedAttempts: 0, lockedUntil: null }).where(eq(usersTable.id, user.id));
    await logLogin({ userId: user.id, email, success: true, ip, userAgent });

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      entityId: user.entityId ?? undefined,
      entityType: user.entityType ?? undefined,
      forcePasswordChange: user.forcePasswordChange,
    });

    res.json({ token, role: user.role, forcePasswordChange: user.forcePasswordChange, email: user.email, userId: user.id, name: user.name ?? user.email.split("@")[0] });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/* ── Troca de senha ── */
router.post("/auth/change-password", async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body as {
    userId?: number; currentPassword?: string; newPassword?: string;
  };
  if (!userId || !currentPassword || !newPassword) {
    res.status(400).json({ error: "Campos obrigatórios ausentes" }); return;
  }
  if (newPassword.trim().length < 6) {
    res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres" }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    const valid = await bcrypt.compare(currentPassword.trim(), user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Senha atual incorreta" }); return; }
    const hash = await bcrypt.hash(newPassword.trim(), 12);
    await db.update(usersTable).set({ passwordHash: hash, forcePasswordChange: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    await logAudit({ userId: user.id, userEmail: user.email, action: "change_password", entityType: "user", entityId: user.id });
    res.json({ message: "Senha alterada com sucesso" });
  } catch (err) {
    req.log.error({ err }, "Change password error");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/* ── Esqueci minha senha (gera token) ── */
router.post("/auth/forgot-password", async (req, res) => {
  const email = ((req.body as { email?: string }).email ?? "").trim().toLowerCase();
  if (!email) { res.status(400).json({ error: "E-mail é obrigatório" }); return; }
  res.json({ message: "Se o e-mail estiver cadastrado, você receberá as instruções em breve." });
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) return;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokensTable).values({ userId: user.id, token, expiresAt });
    console.info(`[Password Reset] Token gerado para ${email}. Token: ${token}`);
  } catch (err) {
    console.error("Forgot password error:", err);
  }
});

/* ── Redefinição de senha via token ── */
router.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword) {
    res.status(400).json({ error: "Token e nova senha são obrigatórios" }); return;
  }
  if (newPassword.trim().length < 6) {
    res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres" }); return;
  }
  try {
    const [reset] = await db.select().from(passwordResetTokensTable)
      .where(and(
        eq(passwordResetTokensTable.token, token),
        eq(passwordResetTokensTable.used, false),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ));
    if (!reset) { res.status(400).json({ error: "Token inválido ou expirado" }); return; }
    const hash = await bcrypt.hash(newPassword.trim(), 12);
    await db.update(usersTable).set({ passwordHash: hash, forcePasswordChange: false, updatedAt: new Date() })
      .where(eq(usersTable.id, reset.userId));
    await db.update(passwordResetTokensTable).set({ used: true }).where(eq(passwordResetTokensTable.id, reset.id));
    res.json({ message: "Senha redefinida com sucesso" });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
