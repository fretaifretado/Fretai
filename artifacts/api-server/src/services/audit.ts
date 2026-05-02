import { db } from "@workspace/db";
import { auditLogsTable, loginLogsTable } from "@workspace/db/schema";

export async function logAudit(opts: {
  userId?: number;
  userEmail?: string;
  companyId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
}) {
  try {
    await db.insert(auditLogsTable).values({
      userId: opts.userId,
      userEmail: opts.userEmail,
      companyId: opts.companyId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      oldValue: opts.oldValue as Record<string, unknown> ?? null,
      newValue: opts.newValue as Record<string, unknown> ?? null,
      ip: opts.ip,
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function logLogin(opts: {
  userId?: number;
  email?: string;
  success: boolean;
  ip?: string;
  userAgent?: string;
}) {
  try {
    await db.insert(loginLogsTable).values({
      userId: opts.userId,
      email: opts.email,
      success: opts.success,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
  } catch (err) {
    console.error("Login log error:", err);
  }
}
