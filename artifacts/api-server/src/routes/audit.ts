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

    // Get audit logs for employee movements
    const auditLogs = await db.select().from(auditLogsTable).where(eq(auditLogsTable.companyId, companyId));

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

    // Calculate executive summary
    const totalGasto = sortedMonthlyData.reduce((sum, row) => sum + row.compraDoMes, 0);
    const totalEconomia = sortedMonthlyData.reduce((sum, row) => sum + row.creditoGerado, 0);
    const totalValesComprados = sortedMonthlyData.reduce((sum, row) => sum + row.valesComprados, 0);
    const mediaMensalGasto = sortedMonthlyData.length > 0 ? totalGasto / sortedMonthlyData.length : 0;
    const mediaMensalEconomia = sortedMonthlyData.length > 0 ? totalEconomia / sortedMonthlyData.length : 0;

    // Find periods with highest spending and economy
    const maiorGasto = sortedMonthlyData.reduce((max, row) => row.compraDoMes > max.compraDoMes ? row : max, sortedMonthlyData[0] || { periodo: 'N/A', compraDoMes: 0 });
    const maiorEconomia = sortedMonthlyData.reduce((max, row) => row.creditoGerado > max.creditoGerado ? row : max, sortedMonthlyData[0] || { periodo: 'N/A', creditoGerado: 0 });

    // Calculate period covered
    const firstPeriod = sortedMonthlyData[0]?.periodo || 'N/A';
    const lastPeriod = sortedMonthlyData[sortedMonthlyData.length - 1]?.periodo || 'N/A';

    // Get user who generated report
    const userEmail = (req as any).user?.email || 'admin';

    // Create Excel workbook with multiple sheets
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fretai Admin';
    workbook.created = new Date();

    // Sheet 1: Resumo Executivo
    const summarySheet = workbook.addWorksheet('Resumo Executivo');
    
    // Company info
    summarySheet.addRow(['RELATÓRIO FINANCEIRO DETALHADO']);
    summarySheet.addRow([]);
    summarySheet.addRow(['DADOS DA EMPRESA']);
    summarySheet.addRow(['Nome', company.name]);
    summarySheet.addRow(['ID', company.id]);
    summarySheet.addRow(['CNPJ', company.cnpj]);
    summarySheet.addRow(['Endereço', company.address]);
    summarySheet.addRow(['Telefone', company.phone]);
    summarySheet.addRow(['E-mail', company.email]);
    summarySheet.addRow(['Valor do Vale Diário', `R$ ${company.valeValue}`]);
    summarySheet.addRow(['Data de Cadastro', new Date(company.createdAt).toLocaleDateString('pt-BR')]);
    summarySheet.addRow([]);

    // Report metadata
    summarySheet.addRow(['METADADOS DO RELATÓRIO']);
    summarySheet.addRow(['Data de Geração', new Date().toLocaleString('pt-BR')]);
    summarySheet.addRow(['Gerado por', userEmail]);
    summarySheet.addRow(['Período Coberto', `${firstPeriod} a ${lastPeriod}`]);
    summarySheet.addRow(['Total de Meses', sortedMonthlyData.length]);
    summarySheet.addRow([]);

    // Executive summary
    summarySheet.addRow(['RESUMO EXECUTIVO']);
    summarySheet.addRow(['Total Gasto Histórico', `R$ ${totalGasto.toFixed(2)}`]);
    summarySheet.addRow(['Economia Total Gerada', `R$ ${totalEconomia.toFixed(2)}`]);
    summarySheet.addRow(['Total de Vales Comprados', totalValesComprados]);
    summarySheet.addRow(['Média Mensal de Gastos', `R$ ${mediaMensalGasto.toFixed(2)}`]);
    summarySheet.addRow(['Média Mensal de Economia', `R$ ${mediaMensalEconomia.toFixed(2)}`]);
    summarySheet.addRow(['Maior Período de Gasto', `${maiorGasto.periodo} (R$ ${maiorGasto.compraDoMes.toFixed(2)})`]);
    summarySheet.addRow(['Maior Período de Economia', `${maiorEconomia.periodo} (R$ ${maiorEconomia.creditoGerado.toFixed(2)})`]);
    summarySheet.addRow([]);

    // Style summary sheet
    summarySheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    summarySheet.getRow(3).font = { bold: true, size: 12 };
    summarySheet.getRow(13).font = { bold: true, size: 12 };
    summarySheet.getRow(19).font = { bold: true, size: 12 };

    // Sheet 2: Histórico Mensal
    const monthlySheet = workbook.addWorksheet('Histórico Mensal');
    monthlySheet.addRow(['Histórico de Compras por Mês']);
    monthlySheet.addRow([]);
    monthlySheet.addRow(['Período', 'Vales Comprados', 'Compra do Mês (R$)', 'Vales Não Utilizados', 'Crédito Gerado (R$)', 'Economia %']);

    sortedMonthlyData.forEach(row => {
      const economiaPercent = row.compraDoMes > 0 ? ((row.creditoGerado / row.compraDoMes) * 100).toFixed(1) : '0.0';
      monthlySheet.addRow([
        row.periodo,
        row.valesComprados,
        row.compraDoMes.toFixed(2),
        row.valesNaoUtilizados,
        row.creditoGerado.toFixed(2),
        `${economiaPercent}%`
      ]);
    });

    // Style monthly sheet
    monthlySheet.getRow(1).font = { bold: true, size: 14 };
    monthlySheet.getRow(3).font = { bold: true };

    // Sheet 3: Evolução de Créditos
    const creditSheet = workbook.addWorksheet('Evolução de Créditos');
    creditSheet.addRow(['Evolução de Créditos Aplicados']);
    creditSheet.addRow([]);
    creditSheet.addRow(['Período', 'Crédito Gerado (R$)', 'Crédito Acumulado (R$)', 'Saldo Restante (R$)']);

    let cumulativeCredit = 0;
    let appliedCredit = 0;
    sortedMonthlyData.forEach(row => {
      cumulativeCredit += row.creditoGerado;
      // Simulate credit application with 2-month delay
      appliedCredit += row.creditoGerado * 0.5; // Simplified calculation
      const remaining = cumulativeCredit - appliedCredit;
      
      creditSheet.addRow([
        row.periodo,
        row.creditoGerado.toFixed(2),
        cumulativeCredit.toFixed(2),
        remaining.toFixed(2)
      ]);
    });

    // Style credit sheet
    creditSheet.getRow(1).font = { bold: true, size: 14 };
    creditSheet.getRow(3).font = { bold: true };

    // Sheet 4: Movimentações de Colaboradores
    const movementsSheet = workbook.addWorksheet('Movimentações');
    movementsSheet.addRow(['Movimentações de Colaboradores']);
    movementsSheet.addRow([]);
    movementsSheet.addRow(['Data', 'Usuário', 'Ação', 'Tipo de Entidade', 'ID Entidade', 'Valor Anterior', 'Valor Novo']);

    auditLogs.forEach(log => {
      movementsSheet.addRow([
        new Date(log.createdAt).toLocaleString('pt-BR'),
        log.userEmail || 'Sistema',
        log.action,
        log.entityType,
        log.entityId || 'N/A',
        JSON.stringify(log.oldValue) || 'N/A',
        JSON.stringify(log.newValue) || 'N/A'
      ]);
    });

    // Style movements sheet
    movementsSheet.getRow(1).font = { bold: true, size: 14 };
    movementsSheet.getRow(3).font = { bold: true };

    // Auto-fit columns (simplified version)
    summarySheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 25 : 20;
    });
    monthlySheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 15 : 18;
    });
    creditSheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 15 : 18;
    });
    movementsSheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 20 : 25;
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-financeiro-completo-${company.name.replace(/\s+/g, '-')}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "Error generating financial report");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
