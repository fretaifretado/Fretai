import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable, companiesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, getAuth } from "../middlewares/auth";

const router = Router();

/**
 * Returns the set of company IDs the authenticated user is allowed to access.
 * Includes the user's own company (entityId) plus all branches under it.
 */
async function getAllowedCompanyIds(entityId: number): Promise<Set<number>> {
  const branches = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.parentCompanyId, entityId));

  const ids = new Set<number>([entityId]);
  for (const b of branches) ids.add(b.id);
  return ids;
}

/* ── Listar pedidos de compra da filial ── */
router.get(
  "/me/purchase-orders",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const companyId = parseInt((req.query.companyId as string) ?? "", 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "companyId inválido" });
      return;
    }

    const auth = getAuth(req);
    const entityId = auth.entityId as number | undefined;
    if (!entityId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    try {
      const allowed = await getAllowedCompanyIds(entityId);
      if (!allowed.has(companyId)) {
        res.status(403).json({ error: "Acesso negado a esta empresa" });
        return;
      }

      const orders = await db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, companyId))
        .orderBy(desc(purchaseOrdersTable.createdAt));

      res.json(
        orders.map(o => ({
          ...o,
          valorUnit: o.valorUnit,
          total: o.total,
          createdAt: o.createdAt?.toISOString?.() ?? o.createdAt,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Error listing purchase orders");
      res.status(500).json({ error: "Erro interno" });
    }
  },
);

/* ── Criar pedidos de compra (lote) ── */
router.post(
  "/me/purchase-orders",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const auth = getAuth(req);
    const entityId = auth.entityId as number | undefined;
    if (!entityId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const body = req.body as {
      companyId: number;
      items: {
        employeeId: number | null;
        nome: string;
        turno: string;
        periodo: string;
        dataInicio: string;
        dataFim: string;
        dias: number;
        vales: number;
        valorUnit: number;
        total: number;
        proRata: boolean;
      }[];
    };

    if (!body.companyId || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: "companyId e items são obrigatórios" });
      return;
    }

    if (body.items.length > 5000) {
      res.status(400).json({ error: "Número máximo de itens por lote é 5000" });
      return;
    }

    for (const item of body.items) {
      if (!item.nome || typeof item.nome !== "string" || item.nome.trim() === "") {
        res.status(400).json({ error: "Cada item deve ter um nome válido" });
        return;
      }
      if (!Number.isFinite(item.dias) || item.dias < 0 || item.dias > 366) {
        res.status(400).json({ error: "Valor de dias inválido" });
        return;
      }
      if (!Number.isFinite(item.vales) || item.vales < 0 || item.vales > 1000) {
        res.status(400).json({ error: "Valor de vales inválido" });
        return;
      }
      if (!Number.isFinite(item.valorUnit) || item.valorUnit < 0 || item.valorUnit > 100000) {
        res.status(400).json({ error: "Valor unitário inválido" });
        return;
      }
      if (!Number.isFinite(item.total) || item.total < 0) {
        res.status(400).json({ error: "Total inválido" });
        return;
      }
    }

    try {
      const allowed = await getAllowedCompanyIds(entityId);
      if (!allowed.has(body.companyId)) {
        res.status(403).json({ error: "Acesso negado a esta empresa" });
        return;
      }

      const inserted = await db
        .insert(purchaseOrdersTable)
        .values(
          body.items.map(item => ({
            companyId: body.companyId,
            employeeId: item.employeeId ?? null,
            nome: item.nome,
            turno: item.turno,
            periodo: item.periodo,
            dataInicio: item.dataInicio,
            dataFim: item.dataFim,
            dias: item.dias,
            vales: item.vales,
            valorUnit: String(item.valorUnit),
            total: String(item.total),
            status: "Aprovado" as const,
            proRata: item.proRata,
          })),
        )
        .returning();

      req.log.info(
        { userId: auth.sub, companyId: body.companyId, count: inserted.length },
        "Purchase orders created",
      );

      res.status(201).json(
        inserted.map(o => ({
          ...o,
          createdAt: o.createdAt?.toISOString?.() ?? o.createdAt,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Error creating purchase orders");
      res.status(500).json({ error: "Erro interno" });
    }
  },
);

/* ── Admin: listar pedidos de compra de uma empresa ── */
router.get(
  "/admin/companies/:id/purchase-orders",
  requireAuth("platform_admin"),
  async (req, res) => {
    const companyId = parseInt(req.params.id as string, 10);
    if (isNaN(companyId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    try {
      const orders = await db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, companyId))
        .orderBy(desc(purchaseOrdersTable.createdAt));
      res.json(
        orders.map(o => ({
          ...o,
          valorUnit: o.valorUnit,
          total: o.total,
          createdAt: o.createdAt?.toISOString?.() ?? o.createdAt,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Admin: error listing purchase orders");
      res.status(500).json({ error: "Erro interno" });
    }
  },
);

export default router;
