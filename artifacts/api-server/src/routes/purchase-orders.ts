import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable, companiesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, getAuth } from "../middlewares/auth";
import { getFinancialSummary, parsePeriodParam, getFinancialSummaryByBranches } from "../services/financial-summary";

const router = Router();

const purchaseOrderSelect = {
  id: purchaseOrdersTable.id,
  companyId: purchaseOrdersTable.companyId,
  employeeId: purchaseOrdersTable.employeeId,
  nome: purchaseOrdersTable.nome,
  turno: purchaseOrdersTable.turno,
  periodo: purchaseOrdersTable.periodo,
  dataInicio: purchaseOrdersTable.dataInicio,
  dataFim: purchaseOrdersTable.dataFim,
  dias: purchaseOrdersTable.dias,
  vales: purchaseOrdersTable.vales,
  valorUnit: purchaseOrdersTable.valorUnit,
  total: purchaseOrdersTable.total,
  status: purchaseOrdersTable.status,
  proRata: purchaseOrdersTable.proRata,
  createdAt: purchaseOrdersTable.createdAt,
};

function serializePurchaseOrder(o: typeof purchaseOrdersTable.$inferSelect) {
  return {
    ...o,
    valorUnit: o.valorUnit,
    total: o.total,
    createdAt: o.createdAt?.toISOString?.() ?? o.createdAt,
  };
}

function internalErrorPayload(err: unknown) {
  if (process.env.NODE_ENV === "production") return { error: "Erro interno" };
  return {
    error: "Erro interno",
    detail: err instanceof Error ? err.message : String(err),
  };
}

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

/* ── Resumo financeiro real da competência ── */
router.get(
  "/me/financial-summary",
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

      const period = parsePeriodParam(req.query.period as string | undefined);
      res.json(await getFinancialSummary(companyId, period));
    } catch (err) {
      if (err instanceof Error && err.message === "period inválido") {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Error building financial summary");
      res.status(500).json(internalErrorPayload(err));
    }
  },
);

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
        .select(purchaseOrderSelect)
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, companyId))
        .orderBy(desc(purchaseOrdersTable.createdAt));

      res.json(orders.map(serializePurchaseOrder));
    } catch (err) {
      req.log.error({ err }, "Error listing purchase orders");
      res.status(500).json(internalErrorPayload(err));
    }
  },
);

/* ── Get financial summary for multiple branches ── */
router.get(
  "/me/financial-summary-by-branches",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const companyIdsParam = req.query.companyIds as string;
    const periodParam = req.query.period as string | undefined;

    if (!companyIdsParam) {
      res.status(400).json({ error: "companyIds é obrigatório" });
      return;
    }

    const companyIds = companyIdsParam.split(",").map(id => parseInt(id.trim(), 10));
    if (companyIds.some(isNaN)) {
      res.status(400).json({ error: "companyIds inválido" });
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
      const unauthorizedIds = companyIds.filter(id => !allowed.has(id));
      if (unauthorizedIds.length > 0) {
        res.status(403).json({ error: "Acesso negado a uma ou mais empresas" });
        return;
      }

      const period = periodParam ? parsePeriodParam(periodParam) : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const summaries = await getFinancialSummaryByBranches(companyIds, period);

      const result = Array.from(summaries.entries()).map(([companyId, summary]) => ({
        companyId,
        period: summary.period,
        periodLabel: summary.periodLabel,
        valesComprados: summary.valesComprados,
        compraDoMes: summary.compraDoMes,
        valesNaoUtilizados: summary.valesNaoUtilizados,
        creditoGerado: summary.creditoGerado,
        creditoAplicado: summary.creditoAplicado,
        saldoCredito: summary.saldoCredito,
        valorNotaFiscal: summary.valorNotaFiscal,
      }));

      res.json(result);
    } catch (err) {
      req.log.error({ err }, "Error getting financial summary by branches");
      res.status(500).json(internalErrorPayload(err));
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

      const existing = await db
        .select({
          id: purchaseOrdersTable.id,
          employeeId: purchaseOrdersTable.employeeId,
          periodo: purchaseOrdersTable.periodo,
          dataInicio: purchaseOrdersTable.dataInicio,
          dataFim: purchaseOrdersTable.dataFim,
          dias: purchaseOrdersTable.dias,
          vales: purchaseOrdersTable.vales,
          valorUnit: purchaseOrdersTable.valorUnit,
          total: purchaseOrdersTable.total,
          status: purchaseOrdersTable.status,
        })
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, body.companyId));

      const existingByKey = new Map(
        existing
          .filter(o => o.employeeId !== null && o.vales > 0 && o.status !== "Cancelado")
          .map(o => [`${o.employeeId}:${o.periodo}`, o]),
      );

      // Purchase orders devem ser fixas - não atualizar existentes
      // Apenas criar novas se não existirem
      const itemsToInsert = body.items.filter(item =>
        item.employeeId === null || !existingByKey.has(`${item.employeeId}:${item.periodo}`),
      );

      if (itemsToInsert.length === 0) {
        req.log.info(
          { userId: auth.sub, companyId: body.companyId, count: 0, skipped: body.items.length },
          "Purchase orders already existed",
        );
        res.status(201).json([]);
        return;
      }

      const inserted = await db
        .insert(purchaseOrdersTable)
        .values(
          itemsToInsert.map(item => ({
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
        { userId: auth.sub, companyId: body.companyId, inserted: inserted.length, skipped: body.items.length - itemsToInsert.length },
        "Purchase orders saved",
      );

      res.status(201).json(inserted.map(serializePurchaseOrder));
    } catch (err) {
      req.log.error({ err }, "Error creating purchase orders");
      res.status(500).json(internalErrorPayload(err));
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
        .select(purchaseOrderSelect)
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.companyId, companyId))
        .orderBy(desc(purchaseOrdersTable.createdAt));
      res.json(orders.map(serializePurchaseOrder));
    } catch (err) {
      req.log.error({ err }, "Admin: error listing purchase orders");
      res.status(500).json(internalErrorPayload(err));
    }
  },
);

export default router;
