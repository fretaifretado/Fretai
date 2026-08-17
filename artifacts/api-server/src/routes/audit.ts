import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, loginLogsTable, employeeImportLogsTable, purchaseOrdersTable, companiesTable } from "@workspace/db/schema";
import { desc, eq, and, like, ne } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import ExcelJS from 'exceljs';

const router = Router();

router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 500);
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;

    let query = db.select().from(auditLogsTable).$dynamic();
    if (companyId) {
      query = query.where(eq(auditLogsTable.companyId, companyId));
    }
    const logs = await query.orderBy(desc(auditLogsTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching audit logs");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/login-logs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const logs = await db.select().from(loginLogsTable).orderBy(desc(loginLogsTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching login logs");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/employee-import-logs", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 500);
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    let query = db.select().from(employeeImportLogsTable).$dynamic();
    
    if (companyId) {
      query = query.where(eq(employeeImportLogsTable.companyId, companyId));
    }
    
    if (status) {
      query = query.where(and(
        companyId ? eq(employeeImportLogsTable.companyId, companyId) : undefined,
        eq(employeeImportLogsTable.status, status)
      ));
    }
    
    if (search) {
      query = query.where(and(
        companyId ? eq(employeeImportLogsTable.companyId, companyId) : undefined,
        status ? eq(employeeImportLogsTable.status, status) : undefined,
        like(employeeImportLogsTable.name, `%${search}%`)
      ));
    }

    const logs = await query.orderBy(desc(employeeImportLogsTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching employee import logs");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/employee-import-logs/export", requireAdmin, async (req, res) => {
  try {
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    let query = db.select().from(employeeImportLogsTable).$dynamic();
    
    if (companyId) {
      query = query.where(eq(employeeImportLogsTable.companyId, companyId));
    }
    
    if (status) {
      query = query.where(and(
        companyId ? eq(employeeImportLogsTable.companyId, companyId) : undefined,
        eq(employeeImportLogsTable.status, status)
      ));
    }
    
    if (search) {
      query = query.where(and(
        companyId ? eq(employeeImportLogsTable.companyId, companyId) : undefined,
        status ? eq(employeeImportLogsTable.status, status) : undefined,
        like(employeeImportLogsTable.name, `%${search}%`)
      ));
    }

    const logs = await query.orderBy(desc(employeeImportLogsTable.createdAt)).limit(10000);

    // Generate CSV
    const headers = ['ID', 'Empresa ID', 'Usuário ID', 'Email Usuário', 'Colaborador ID', 'Nome', 'CPF', 'Status', 'Motivo', 'Data'];
    const csvRows = [
      headers.join(','),
      ...logs.map(l => [
        l.id,
        l.companyId,
        l.userId || '',
        l.userEmail || '',
        l.employeeId || '',
        `"${l.name}"`,
        l.cpf,
        l.status,
        `"${l.reason || ''}"`,
        l.createdAt.toISOString()
      ].join(','))
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-import-logs.csv"');
    res.send(csvRows.join('\n'));
  } catch (err) {
    req.log.error({ err }, "Error exporting employee import logs");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/admin/financial-report/:companyId", requireAdmin, async (req, res) => {
  try {
    const companyIdParam = req.params.companyId;
    const companyId = parseInt(Array.isArray(companyIdParam) ? companyIdParam[0] : companyIdParam);
    if (!companyId) {
      res.status(400).json({ error: "Company ID required" });
      return;
    }

    // Get company info
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Get all purchase orders for this company (excluding cancelled)
    const orders = await db.select().from(purchaseOrdersTable).where(and(
      eq(purchaseOrdersTable.companyId, companyId),
      ne(purchaseOrdersTable.status, "Cancelado")
    ));

    // Group by period for monthly history
    const monthlyData = new Map<string, {
      periodo: string;
      valesComprados: number;
      compraDoMes: number;
      valesNaoUtilizados: number;
      creditoGerado: number;
    }>();

    orders.forEach(order => {
      const existing = monthlyData.get(order.periodo) || {
        periodo: order.periodo,
        valesComprados: 0,
        compraDoMes: 0,
        valesNaoUtilizados: 0,
        creditoGerado: 0,
      };

      const total = parseFloat(String(order.total));
      if (order.vales > 0) {
        existing.valesComprados += order.vales;
        existing.compraDoMes += total;
      } else if (order.vales < 0) {
        existing.valesNaoUtilizados += Math.abs(order.vales);
        existing.creditoGerado += Math.abs(total);
      }

      monthlyData.set(order.periodo, existing);
    });

    // Sort by period
    const sortedMonthlyData = Array.from(monthlyData.values()).sort((a, b) => {
      const [aMonth, aYear] = a.periodo.split('/');
      const [bMonth, bYear] = b.periodo.split('/');
      const monthOrder = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      if (aYear !== bYear) return parseInt(aYear) - parseInt(bYear);
      return monthOrder.indexOf(aMonth) - monthOrder.indexOf(bMonth);
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório Financeiro');

    // Add company info header
    worksheet.addRow(['Empresa', company.name]);
    worksheet.addRow(['ID da Empresa', company.id]);
    worksheet.addRow(['Data do Relatório', new Date().toLocaleDateString('pt-BR')]);
    worksheet.addRow([]);

    // Add monthly history section
    worksheet.addRow(['Histórico de Compras por Mês']);
    worksheet.addRow(['Período', 'Vales Comprados', 'Compra do Mês (R$)', 'Vales Não Utilizados', 'Crédito Gerado (R$)']);

    sortedMonthlyData.forEach(row => {
      worksheet.addRow([
        row.periodo,
        row.valesComprados,
        row.compraDoMes.toFixed(2),
        row.valesNaoUtilizados,
        row.creditoGerado.toFixed(2)
      ]);
    });

    worksheet.addRow([]);

    // Add credit evolution section
    worksheet.addRow(['Evolução de Créditos Aplicados']);
    worksheet.addRow(['Período', 'Crédito Acumulado (R$)']);

    let cumulativeCredit = 0;
    sortedMonthlyData.forEach(row => {
      cumulativeCredit += row.creditoGerado;
      worksheet.addRow([row.periodo, cumulativeCredit.toFixed(2)]);
    });

    // Style the worksheet
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(5).font = { bold: true };
    worksheet.getRow(6).font = { bold: true };
    worksheet.getRow(sortedMonthlyData.length + 9).font = { bold: true };
    worksheet.getRow(sortedMonthlyData.length + 10).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-${company.name.replace(/\s+/g, '-')}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "Error generating financial report");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
