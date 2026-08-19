import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { companiesTable, employeesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET
  ?? (process.env.NODE_ENV === "production"
    ? (() => { throw new Error("SESSION_SECRET é obrigatório em produção"); })()
    : "fallback-secret-change-me");

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

export async function canAccessCompany(auth: AuthPayload, companyId: number): Promise<boolean> {
  if (auth.role === "platform_admin") return true;
  if (auth.entityType !== "company" || !Number.isInteger(auth.entityId)) return false;
  if (auth.entityId === companyId) return true;

  const [company] = await db.select({ parentCompanyId: companiesTable.parentCompanyId })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return company?.parentCompanyId === auth.entityId;
}

export async function canAccessEmployee(auth: AuthPayload, employeeId: number): Promise<boolean> {
  const [employee] = await db.select({ companyId: employeesTable.companyId })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  return Boolean(employee && await canAccessCompany(auth, employee.companyId));
}

export function canAccessPartner(auth: AuthPayload, partnerId: number): boolean {
  return auth.role === "platform_admin"
    || (auth.role === "parceiro_master" && auth.entityType === "partner" && auth.entityId === partnerId);
}
