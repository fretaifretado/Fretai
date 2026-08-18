import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, loginLogsTable, employeeImportLogsTable, purchaseOrdersTable, companiesTable, scheduledMovementsTable, scheduledMovementTargetsTable, employeesTable } from "@workspace/db/schema";
import { desc, eq, and, like, ne, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import ExcelJS from 'exceljs';
import { getFinancialHistory, periodFromLabel, periodKey, periodLabel, type Period } from "../services/financial-summary";

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

    // Get scheduled movements for employee status changes
    const scheduledMovements = await db.select({
      id: scheduledMovementsTable.id,
      tipo: scheduledMovementsTable.tipo,
      valorNovo: scheduledMovementsTable.valorNovo,
      inicio: scheduledMovementsTable.inicio,
      fim: scheduledMovementsTable.fim,
      estado: scheduledMovementsTable.estado,
      createdAt: scheduledMovementsTable.createdAt,
    }).from(scheduledMovementsTable).where(
      eq(scheduledMovementsTable.companyId, companyId)
    ).orderBy(desc(scheduledMovementsTable.inicio));

    const movementIds = scheduledMovements.map(m => m.id);
    const movementTargets = movementIds.length > 0
      ? await db.select({
          scheduledMovementId: scheduledMovementTargetsTable.scheduledMovementId,
          colaboradorId: scheduledMovementTargetsTable.colaboradorId,
          valorAnterior: scheduledMovementTargetsTable.valorAnterior,
        }).from(scheduledMovementTargetsTable).where(inArray(scheduledMovementTargetsTable.scheduledMovementId, movementIds))
      : [];

    // Get employee names
    const discountOrders = orders.filter(order => order.vales < 0);
    const employeeIds = [...new Set([
      ...movementTargets.map(t => t.colaboradorId),
      ...discountOrders.flatMap(order => order.employeeId === null ? [] : [order.employeeId]),
    ])];
    const employees = await db.select({
      id: employeesTable.id,
      name: employeesTable.name,
    }).from(employeesTable).where(
      employeeIds.length > 0 ? inArray(employeesTable.id, employeeIds) : undefined
    );

    const employeeMap = new Map(employees.map(e => [e.id, e.name]));

    const sortedMonthlyData = (await getFinancialHistory(companyId)).map(summary => ({
      periodo: summary.periodLabel,
      valesComprados: summary.valesComprados,
      compraDoMes: summary.compraDoMes,
      valesNaoUtilizados: summary.valesNaoUtilizados,
      creditoGerado: summary.creditoGerado,
      creditoAplicado: summary.creditoAplicado,
      creditoPendente: summary.creditoPendente,
      saldoCredito: summary.saldoCredito,
      valorNotaFiscal: summary.valorNotaFiscal,
    }));

    type MonthlyRow = typeof sortedMonthlyData[number];
    const emptyMonthlyRow: MonthlyRow = {
      periodo: 'N/A',
      valesComprados: 0,
      compraDoMes: 0,
      valesNaoUtilizados: 0,
      creditoGerado: 0,
      creditoAplicado: 0,
      creditoPendente: 0,
      saldoCredito: 0,
      valorNotaFiscal: 0,
    };

    // Calculate executive summary
    const totalGasto = sortedMonthlyData.reduce((sum, row) => sum + row.valorNotaFiscal, 0);
    const totalComprasBrutas = sortedMonthlyData.reduce((sum, row) => sum + row.compraDoMes, 0);
    const totalEconomia = sortedMonthlyData.reduce((sum, row) => sum + row.creditoGerado, 0);
    const totalCreditoAplicado = sortedMonthlyData.reduce((sum, row) => sum + row.creditoAplicado, 0);
    const totalValesComprados = sortedMonthlyData.reduce((sum, row) => sum + row.valesComprados, 0);
    const mediaMensalGasto = sortedMonthlyData.length > 0 ? totalGasto / sortedMonthlyData.length : 0;
    const mediaMensalEconomia = sortedMonthlyData.length > 0 ? totalEconomia / sortedMonthlyData.length : 0;

    // Find periods with highest spending and economy
    const maiorGasto = sortedMonthlyData.reduce((max, row) => row.valorNotaFiscal > max.valorNotaFiscal ? row : max, sortedMonthlyData[0] || emptyMonthlyRow);
    const maiorEconomia = sortedMonthlyData.reduce((max, row) => row.creditoGerado > max.creditoGerado ? row : max, sortedMonthlyData[0] || emptyMonthlyRow);

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
    summarySheet.addRow(['Total Comprado Histórico', `R$ ${totalComprasBrutas.toFixed(2)}`]);
    summarySheet.addRow(['Total Gasto Histórico (NF)', `R$ ${totalGasto.toFixed(2)}`]);
    summarySheet.addRow(['Economia Total Gerada', `R$ ${totalEconomia.toFixed(2)}`]);
    summarySheet.addRow(['Crédito Total Aplicado', `R$ ${totalCreditoAplicado.toFixed(2)}`]);
    summarySheet.addRow(['Total de Vales Comprados', totalValesComprados]);
    summarySheet.addRow(['Média Mensal de Gastos', `R$ ${mediaMensalGasto.toFixed(2)}`]);
    summarySheet.addRow(['Média Mensal de Economia', `R$ ${mediaMensalEconomia.toFixed(2)}`]);
    summarySheet.addRow(['Maior Período de Gasto', `${maiorGasto.periodo} (R$ ${maiorGasto.valorNotaFiscal.toFixed(2)})`]);
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
    monthlySheet.addRow(['Período', 'Vales Comprados', 'Compra do Mês (R$)', 'Vales Não Utilizados', 'Crédito Gerado (R$)', 'Crédito Aplicado (R$)', 'Crédito Pendente (R$)', 'Valor Nota Fiscal (R$)', 'Economia %']);

    sortedMonthlyData.forEach(row => {
      const economiaPercent = row.compraDoMes > 0 ? ((row.creditoGerado / row.compraDoMes) * 100).toFixed(1) : '0.0';
      monthlySheet.addRow([
        row.periodo,
        row.valesComprados,
        row.compraDoMes.toFixed(2),
        row.valesNaoUtilizados,
        row.creditoGerado.toFixed(2),
        row.creditoAplicado.toFixed(2),
        row.creditoPendente.toFixed(2),
        row.valorNotaFiscal.toFixed(2),
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
    creditSheet.addRow(['Período', 'Crédito Gerado (R$)', 'Crédito Aplicado (R$)', 'Crédito Pendente (R$)', 'Saldo Crédito (R$)', 'Valor Nota Fiscal (R$)']);

    sortedMonthlyData.forEach(row => {
      creditSheet.addRow([
        row.periodo,
        row.creditoGerado.toFixed(2),
        row.creditoAplicado.toFixed(2),
        row.creditoPendente.toFixed(2),
        row.saldoCredito.toFixed(2),
        row.valorNotaFiscal.toFixed(2),
      ]);
    });

    // Style credit sheet
    creditSheet.getRow(1).font = { bold: true, size: 14 };
    creditSheet.getRow(3).font = { bold: true };

    // Sheet 4: Movimentações de Colaboradores
    const movementsSheet = workbook.addWorksheet('Movimentações');
    movementsSheet.addRow(['Movimentações de Colaboradores']);
    movementsSheet.addRow([]);
    movementsSheet.addRow(['Mês', 'Status / Origem', 'Data Início', 'Data Fim', 'Status Técnico', 'Colaboradores Afetados', 'Estado', 'Valor Crédito (R$)']);

    type MovementReportRow = {
      tipo: string;
      inicio: string;
      fim: string;
      valorNovo: string;
      estado: string;
      colaboradores: string[];
      valorCredito: number;
    };
    const movementsByPeriod = new Map<string, MovementReportRow[]>();
    const claimedDiscountOrderIds = new Set<number>();
    const seenScheduleTargets = new Set<string>();

    function periodFromIsoDate(value: string): Period | null {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12) return null;
      return { year, month };
    }

    function fullPeriodLabel(value: string): string {
      const period = periodFromLabel(value);
      if (!period) return value;
      return new Date(Date.UTC(period.year, period.month - 1, 1)).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }

    function formatIsoDate(value: string): string {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
    }

    // Keep one target per identical schedule. Old duplicate records remain auditable,
    // but no longer duplicate the same financial entry in the report.
    [...scheduledMovements]
      .sort((a, b) => a.id - b.id)
      .forEach(movement => {
      if (movement.tipo !== 'status') return;

      const period = periodFromIsoDate(movement.inicio);
      if (!period) return;
      const periodName = periodLabel(period);
      const targets = movementTargets.filter(t => t.scheduledMovementId === movement.id);
      const uniqueTargets = targets.filter(target => {
        const key = [
          movement.tipo,
          movement.valorNovo,
          movement.inicio,
          movement.fim,
          target.colaboradorId,
        ].join('|');
        if (seenScheduleTargets.has(key)) return false;
        seenScheduleTargets.add(key);
        return true;
      });
      if (uniqueTargets.length === 0) return;

      const colaboradorNames = uniqueTargets.map(t => employeeMap.get(t.colaboradorId) || 'Desconhecido');
      const targetIds = new Set(uniqueTargets.map(t => t.colaboradorId));

      // Each financial order can belong to at most one detail row.
      const movementOrders = discountOrders.filter(order => {
        const orderPeriod = periodFromLabel(order.periodo);
        return order.employeeId !== null &&
          !claimedDiscountOrderIds.has(order.id) &&
          targetIds.has(order.employeeId) &&
          order.dataInicio === movement.inicio &&
          orderPeriod !== null &&
          periodLabel(orderPeriod) === periodName;
      });
      movementOrders.forEach(order => claimedDiscountOrderIds.add(order.id));
      const valorCredito = movementOrders.reduce((sum, order) => sum + Math.abs(parseFloat(String(order.total))), 0);

      const existing = movementsByPeriod.get(periodName) || [];
      existing.push({
        tipo: movement.tipo,
        inicio: movement.inicio,
        fim: movement.fim,
        valorNovo: movement.valorNovo,
        estado: movement.estado,
        colaboradores: colaboradorNames,
        valorCredito,
      });
      movementsByPeriod.set(periodName, existing);
    });

    // Credits without a visible status schedule (for example, branch changes or
    // historical records whose schedule was removed) are still listed so the
    // detail always reconciles with the monthly financial ledger.
    discountOrders.forEach(order => {
      if (claimedDiscountOrderIds.has(order.id)) return;
      const period = periodFromLabel(order.periodo);
      if (!period) return;
      const periodName = periodLabel(period);
      const existing = movementsByPeriod.get(periodName) || [];
      existing.push({
        tipo: 'financeiro',
        inicio: order.dataInicio,
        fim: order.dataFim,
        valorNovo: 'Crédito financeiro',
        estado: 'financeiro',
        colaboradores: [order.employeeId === null ? order.nome : (employeeMap.get(order.employeeId) || order.nome)],
        valorCredito: Math.abs(parseFloat(String(order.total))),
      });
      claimedDiscountOrderIds.add(order.id);
      movementsByPeriod.set(periodName, existing);
    });

    // Sort months by date
    const sortedPeriods = Array.from(movementsByPeriod.keys()).sort((a, b) => {
      const periodA = periodFromLabel(a);
      const periodB = periodFromLabel(b);
      if (!periodA || !periodB) return a.localeCompare(b);
      return periodKey(periodA) - periodKey(periodB);
    });

    sortedPeriods.forEach(periodName => {
      const movements = movementsByPeriod.get(periodName) || [];
      movements.forEach(mov => {
        movementsSheet.addRow([
          fullPeriodLabel(periodName).replace(/^./, char => char.toUpperCase()),
          mov.valorNovo,
          formatIsoDate(mov.inicio),
          formatIsoDate(mov.fim),
          mov.estado,
          mov.colaboradores.length > 0 ? mov.colaboradores.slice(0, 3).join(', ') + (mov.colaboradores.length > 3 ? ` (+${mov.colaboradores.length - 3})` : '') : 'N/A',
          mov.estado === 'financeiro' ? 'Lançamento financeiro' : mov.estado === 'ativo' ? 'Em andamento' : mov.estado === 'concluido' ? 'Concluído' : 'Pendente',
          mov.valorCredito.toFixed(2)
        ]);
      });
    });

    // Sheet 5: explicit reconciliation between the ledger and the detail above.
    const reconciliationSheet = workbook.addWorksheet('Conciliação');
    reconciliationSheet.addRow(['Conciliação de Créditos']);
    reconciliationSheet.addRow([]);
    reconciliationSheet.addRow(['Período', 'Crédito no Histórico (R$)', 'Crédito Detalhado (R$)', 'Diferença (R$)', 'Status']);
    sortedMonthlyData.forEach(row => {
      const detailedCredit = (movementsByPeriod.get(row.periodo) || [])
        .reduce((sum, movement) => sum + movement.valorCredito, 0);
      const difference = Math.round((detailedCredit - row.creditoGerado) * 100) / 100;
      reconciliationSheet.addRow([
        row.periodo,
        row.creditoGerado.toFixed(2),
        detailedCredit.toFixed(2),
        difference.toFixed(2),
        Math.abs(difference) < 0.01 ? 'OK' : 'Revisar',
      ]);
    });
    reconciliationSheet.getRow(1).font = { bold: true, size: 14 };
    reconciliationSheet.getRow(3).font = { bold: true };

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
    reconciliationSheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 15 : 24;
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
