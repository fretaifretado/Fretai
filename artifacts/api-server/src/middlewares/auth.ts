import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET ?? "fallback-secret-change-me";

export interface AuthPayload {
  sub: number | string;
  email: string;
  role: string;
  entityId?: number;
  entityType?: string;
  forcePasswordChange?: boolean;
}

export function signToken(payload: AuthPayload, expiresIn = "8h"): string {
  return jwt.sign(payload, SECRET, { expiresIn } as jwt.SignOptions);
}

export function signAdminToken(username: string): string {
  return signToken({ sub: 0, email: username, role: "platform_admin" });
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Token não informado" }); return; }
  try {
    const payload = jwt.verify(token, SECRET) as AuthPayload;
    if (payload.role !== "platform_admin") { res.status(403).json({ error: "Acesso negado" }); return; }
    (req as Request & { auth: AuthPayload }).auth = payload;
    next();
  } catch { res.status(401).json({ error: "Token inválido ou expirado" }); }
}

export function requireAuth(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Token não informado" }); return; }
    try {
      const payload = jwt.verify(token, SECRET) as AuthPayload;
      if (roles.length > 0 && !roles.includes(payload.role)) {
        res.status(403).json({ error: "Acesso negado" }); return;
      }
      if (typeof payload.sub === "number" && payload.sub > 0) {
        const [user] = await db.select({ isActive: usersTable.isActive })
          .from(usersTable).where(eq(usersTable.id, payload.sub as number));
        if (!user || !user.isActive) { res.status(401).json({ error: "Conta inativa" }); return; }
      }
      (req as Request & { auth: AuthPayload }).auth = payload;
      next();
    } catch { res.status(401).json({ error: "Token inválido ou expirado" }); }
  };
}

export function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}
