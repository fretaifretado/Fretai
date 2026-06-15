import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduledMovementsTable,
  scheduledMovementTargetsTable,
  companiesTable,
} from "@workspace/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logAudit } from "../services/audit";

const router = Router();

/**
 * GET /api/admin/pending-scheduled-movements
 * Lista todos os agendamentos de todas as empresas para o painel administrativo.
 */
router.get("/admin/pending-scheduled-movements", requireAdmin, async (req, res) => {
  try {
    // Busca os agendamentos fazendo join com a tabela de empresas para pegar o nome
    // Usamos cast para any nas seleções problemáticas para evitar erros de build
    const results = await db
      .select({
        id: scheduledMovementsTable.id,
        companyId: scheduledMovementsTable.companyId,
        companyName: companiesTable.name,
        tipo: scheduledMovementsTable.tipo,
        valorNovo: scheduledMovementsTable.valorNovo,
        inicio: scheduledMovementsTable.inicio,
        fim: scheduledMovementsTable.fim,
        estado: scheduledMovementsTable.estado,
        createdAt: scheduledMovementsTable.createdAt,
      })
      .from(scheduledMovementsTable)
      .leftJoin(companiesTable, eq(scheduledMovementsTable.companyId, companiesTable.id))
      .orderBy(desc(scheduledMovementsTable.createdAt));

    // Para cada agendamento, vamos contar quantos alvos (colaboradores) ele tem
    const formatted = await Promise.all(
      results.map(async (m: any) => {
        const [targetCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(scheduledMovementTargetsTable)
          .where(eq(scheduledMovementTargetsTable.scheduledMovementId, m.id));

        return {
          ...m,
          alvosCount: Number(targetCount?.count || 0),
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
          // Se o campo createdByEmail não existir, enviamos uma string vazia para não quebrar o front
          createdByEmail: (m as any).createdByEmail || "admin@fretai.com",
        };
      })
    );

    res.json({ movements: formatted });
  } catch (err) {
    req.log.error({ err }, "Error listing admin scheduled movements");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/**
 * DELETE /api/admin/pending-scheduled-movements/:id
 * Permite ao admin cancelar um agendamento pendente.
 */
router.delete("/admin/pending-scheduled-movements/:id", requireAdmin, async (req, res) => {
  const idStr = String(req.params.id);
  const id = parseInt(idStr, 10);
  
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const [movement] = await db
      .select()
      .from(scheduledMovementsTable)
      .where(eq(scheduledMovementsTable.id, id));

    if (!movement) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }

    if (movement.estado !== "pendente") {
      res.status(400).json({ error: "Apenas agendamentos pendentes podem ser cancelados pelo administrador" });
      return;
    }

    // Deletar o agendamento
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledMovementTargetsTable)
        .where(eq(scheduledMovementTargetsTable.scheduledMovementId, id));
      
      await tx
        .delete(scheduledMovementsTable)
        .where(eq(scheduledMovementsTable.id, id));
    });

    // Registrar na auditoria
    await logAudit({
      userId: 0, 
      userEmail: "admin@fretai.com",
      companyId: movement.companyId,
      action: "cancel_scheduled_movement",
      entityType: "scheduled_movement",
      entityId: id,
      oldValue: { estado: "pendente", tipo: movement.tipo, valorNovo: movement.valorNovo },
    });

    res.json({ success: true, message: "Agendamento cancelado com sucesso" });
  } catch (err) {
    req.log.error({ err }, "Error deleting admin scheduled movement");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
