import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, loginLogsTable, employeeImportLogsTable, purchaseOrdersTable, companiesTable, scheduledMovementsTable, scheduledMovementTargetsTable, employeesTable } from "@workspace/db/schema";
import { desc, eq, and, like, ne, inArray } from "drizzle-orm";
import { canAccessCompany, getAuth, requireAdmin, requireAuth } from "../middlewares/auth";
import ExcelJS from 'exceljs';
import {
  getFinancialHistory,
  getFinancialSummaryByBranches,
  periodFromKey,
  periodFromLabel,
  periodKey,
  periodLabel,
  parsePeriodParam,
  type Period,
} from "../services/financial-summary";

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

async function sendFinancialReport(
  req: Request,
  res: Response,
  forceClientReport = false,
  requestedCompanyIds?: number[],
): Promise<void> {
  try {
    const isClientReport = forceClientReport || req.query.format === 'client';
    const companyIdParam = req.params.companyId;
    const companyId = parseInt(Array.isArray(companyIdParam) ? companyIdParam[0] : companyIdParam);
    if (!companyId) {
      res.status(400).json({ error: "Company ID required" });
      return;
    }
    const companyIds = requestedCompanyIds?.length ? [...new Set(requestedCompanyIds)] : [companyId];
    const periodsParam = [...new Set(req.query.periods === undefined
      ? []
      : String(req.query.periods).split(",").map(value => value.trim()).filter(Boolean)
    )];
    if (periodsParam.length > 12) {
      res.status(400).json({ error: "No máximo 12 competências por relatório" });
      return;
    }
    let requestedPeriods: Period[] | null = null;
    try {
      requestedPeriods = periodsParam.length > 0
        ? periodsParam.map(value => parsePeriodParam(value))
        : null;
    } catch {
      res.status(400).json({ error: "Competência inválida" });
      return;
    }
    const monthsParam = req.query.months === undefined ? null : Number(req.query.months);
    if (monthsParam !== null && ![1, 3, 6, 12].includes(monthsParam)) {
      res.status(400).json({ error: "Período inválido" });
      return;
    }
    const currentPeriod = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    const fallbackPeriods = monthsParam === null
      ? null
      : Array.from({ length: monthsParam }, (_, index) =>
          periodFromKey(periodKey(currentPeriod) - monthsParam + 1 + index),
        );
    const filteredPeriods = requestedPeriods ?? fallbackPeriods;
    const allowedPeriodKeys = filteredPeriods === null
      ? null
      : new Set(filteredPeriods.map(periodKey));
    const isPeriodAllowed = (period: Period | null) =>
      period !== null && (allowedPeriodKeys === null || allowedPeriodKeys.has(periodKey(period)));

    // Get company info
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Get all purchase orders for this company (excluding cancelled)
    const allOrders = await db.select().from(purchaseOrdersTable).where(and(
      companyIds.length === 1
        ? eq(purchaseOrdersTable.companyId, companyIds[0]!)
        : inArray(purchaseOrdersTable.companyId, companyIds),
      ne(purchaseOrdersTable.status, "Cancelado")
    ));
    const orders = allOrders.filter(order => isPeriodAllowed(periodFromLabel(order.periodo)));

    // Get scheduled movements for employee status changes
    const allScheduledMovements = await db.select({
      id: scheduledMovementsTable.id,
      tipo: scheduledMovementsTable.tipo,
      valorNovo: scheduledMovementsTable.valorNovo,
      inicio: scheduledMovementsTable.inicio,
      fim: scheduledMovementsTable.fim,
      estado: scheduledMovementsTable.estado,
      createdAt: scheduledMovementsTable.createdAt,
    }).from(scheduledMovementsTable).where(
      companyIds.length === 1
        ? eq(scheduledMovementsTable.companyId, companyIds[0]!)
        : inArray(scheduledMovementsTable.companyId, companyIds)
    ).orderBy(desc(scheduledMovementsTable.inicio));
    const scheduledMovements = allScheduledMovements.filter(movement => {
      const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(movement.inicio);
      return isPeriodAllowed(match ? { year: Number(match[1]), month: Number(match[2]) } : null);
    });

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

    const financialSummaries = filteredPeriods === null
      ? (await Promise.all(companyIds.map(id => getFinancialHistory(id)))).flat()
      : (await Promise.all(
          filteredPeriods.map(period => getFinancialSummaryByBranches(companyIds, period)),
        )).flatMap(summaries => Array.from(summaries.values()));
    const monthlyDataByKey = new Map<number, {
      periodo: string;
      valesComprados: number;
      compraDoMes: number;
      valesNaoUtilizados: number;
      creditoGerado: number;
      creditoAplicado: number;
      creditoPendente: number;
      saldoCredito: number;
      valorNotaFiscal: number;
    }>();
    for (const summary of financialSummaries) {
      const period = periodFromLabel(summary.periodLabel);
      if (!isPeriodAllowed(period)) continue;
      const key = periodKey(period!);
      const current = monthlyDataByKey.get(key) ?? {
        periodo: summary.periodLabel,
        valesComprados: 0,
        compraDoMes: 0,
        valesNaoUtilizados: 0,
        creditoGerado: 0,
        creditoAplicado: 0,
        creditoPendente: 0,
        saldoCredito: 0,
        valorNotaFiscal: 0,
      };
      current.valesComprados += summary.valesComprados;
      current.compraDoMes += summary.compraDoMes;
      current.valesNaoUtilizados += summary.valesNaoUtilizados;
      current.creditoGerado += summary.creditoGerado;
      current.creditoAplicado += summary.creditoAplicado;
      current.creditoPendente += summary.creditoPendente;
      current.saldoCredito += summary.saldoCredito;
      current.valorNotaFiscal += summary.valorNotaFiscal;
      monthlyDataByKey.set(key, current);
    }
    const sortedMonthlyData = Array.from(monthlyDataByKey.entries())
      .sort(([a], [b]) => a - b)
      .map(([, row]) => row);
    const displayCompanyName = companyIds.length > 1
      ? `${company.name} - Visão Global`
      : company.name;

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
    const userEmail = getAuth(req).email;

    // Create Excel workbook with multiple sheets
    const workbook = new ExcelJS.Workbook();
    workbook.creator = isClientReport ? 'Fretai' : 'Fretai Admin';
    workbook.created = new Date();

    // Sheet 1: Resumo Executivo
    const summarySheet = workbook.addWorksheet(isClientReport ? 'Resumo' : 'Resumo Executivo');
    
    // Company info
    const summaryTitleRow = summarySheet.addRow([
      isClientReport ? 'RELATÓRIO FINANCEIRO GERENCIAL' : 'RELATÓRIO FINANCEIRO DETALHADO',
    ]);
    summarySheet.addRow([]);
    const companyHeaderRow = summarySheet.addRow(['DADOS DA EMPRESA']);
    summarySheet.addRow(['Nome', displayCompanyName]);
    if (!isClientReport) summarySheet.addRow(['ID', company.id]);
    summarySheet.addRow(['CNPJ', company.cnpj]);
    summarySheet.addRow(['Endereço', company.address]);
    summarySheet.addRow(['Telefone', company.phone]);
    summarySheet.addRow(['E-mail', company.email]);
    summarySheet.addRow(['Valor do Vale Diário', `R$ ${company.valeValue}`]);
    summarySheet.addRow(['Data de Cadastro', new Date(company.createdAt).toLocaleDateString('pt-BR')]);
    summarySheet.addRow([]);

    // Report metadata
    const metadataHeaderRow = summarySheet.addRow([
      isClientReport ? 'INFORMAÇÕES DO RELATÓRIO' : 'METADADOS DO RELATÓRIO',
    ]);
    summarySheet.addRow(['Data de Geração', new Date().toLocaleString('pt-BR')]);
    if (!isClientReport) summarySheet.addRow(['Gerado por', userEmail]);
    summarySheet.addRow(['Período Coberto', `${firstPeriod} a ${lastPeriod}`]);
    summarySheet.addRow(['Total de Meses', sortedMonthlyData.length]);
    summarySheet.addRow([]);

    // Executive summary
    const executiveHeaderRow = summarySheet.addRow(['RESUMO EXECUTIVO']);
    summarySheet.addRow([isClientReport ? 'Total Comprado no Período' : 'Total Comprado Histórico', `R$ ${totalComprasBrutas.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Total Faturado no Período' : 'Total Gasto Histórico (NF)', `R$ ${totalGasto.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Créditos Gerados no Período' : 'Economia Total Gerada', `R$ ${totalEconomia.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Créditos Aplicados no Período' : 'Crédito Total Aplicado', `R$ ${totalCreditoAplicado.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Total de Vales Adquiridos' : 'Total de Vales Comprados', totalValesComprados]);
    summarySheet.addRow([isClientReport ? 'Média Mensal Faturada' : 'Média Mensal de Gastos', `R$ ${mediaMensalGasto.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Média Mensal de Créditos' : 'Média Mensal de Economia', `R$ ${mediaMensalEconomia.toFixed(2)}`]);
    summarySheet.addRow([isClientReport ? 'Mês de Maior Faturamento' : 'Maior Período de Gasto', `${maiorGasto.periodo} (R$ ${maiorGasto.valorNotaFiscal.toFixed(2)})`]);
    summarySheet.addRow([isClientReport ? 'Mês com Maior Crédito Gerado' : 'Maior Período de Economia', `${maiorEconomia.periodo} (R$ ${maiorEconomia.creditoGerado.toFixed(2)})`]);
    summarySheet.addRow([]);

    // Style summary sheet
    summaryTitleRow.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    summaryTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isClientReport ? 'FF0F172A' : 'FF4F46E5' } };
    companyHeaderRow.font = { bold: true, size: 12 };
    metadataHeaderRow.font = { bold: true, size: 12 };
    executiveHeaderRow.font = { bold: true, size: 12 };

    // Sheet 2: Histórico Mensal
    const monthlySheet = workbook.addWorksheet('Histórico Mensal');
    monthlySheet.addRow([isClientReport ? 'Histórico Financeiro Mensal' : 'Histórico de Compras por Mês']);
    monthlySheet.addRow([]);
    monthlySheet.addRow(isClientReport
      ? ['Período', 'Vales Adquiridos', 'Valor Bruto (R$)', 'Vales Não Utilizados', 'Créditos Gerados (R$)', 'Créditos Aplicados (R$)', 'Créditos a Aplicar (R$)', 'Valor Faturado (R$)', 'Economia %']
      : ['Período', 'Vales Comprados', 'Compra do Mês (R$)', 'Vales Não Utilizados', 'Crédito Gerado (R$)', 'Crédito Aplicado (R$)', 'Crédito Pendente (R$)', 'Valor Nota Fiscal (R$)', 'Economia %']);

    sortedMonthlyData.forEach(row => {
      const economiaPercent = row.compraDoMes > 0 ? ((row.creditoGerado / row.compraDoMes) * 100).toFixed(1) : '0.0';
      monthlySheet.addRow(isClientReport
        ? [
            row.periodo,
            row.valesComprados,
            row.compraDoMes,
            row.valesNaoUtilizados,
            row.creditoGerado,
            row.creditoAplicado,
            row.creditoPendente,
            row.valorNotaFiscal,
            Number(economiaPercent) / 100,
          ]
        : [
            row.periodo,
            row.valesComprados,
            row.compraDoMes.toFixed(2),
            row.valesNaoUtilizados,
            row.creditoGerado.toFixed(2),
            row.creditoAplicado.toFixed(2),
            row.creditoPendente.toFixed(2),
            row.valorNotaFiscal.toFixed(2),
            `${economiaPercent}%`,
          ]);
    });

    // Style monthly sheet
    monthlySheet.getRow(1).font = { bold: true, size: 14 };
    monthlySheet.getRow(3).font = { bold: true };

    // Sheet 3: Evolução de Créditos
    const creditSheet = workbook.addWorksheet(isClientReport ? 'Créditos' : 'Evolução de Créditos');
    creditSheet.addRow([isClientReport ? 'Evolução dos Créditos' : 'Evolução de Créditos Aplicados']);
    creditSheet.addRow([]);
    creditSheet.addRow(isClientReport
      ? ['Período', 'Créditos Gerados (R$)', 'Créditos Aplicados (R$)', 'Créditos a Aplicar (R$)', 'Saldo de Créditos (R$)', 'Valor Faturado (R$)']
      : ['Período', 'Crédito Gerado (R$)', 'Crédito Aplicado (R$)', 'Crédito Pendente (R$)', 'Saldo Crédito (R$)', 'Valor Nota Fiscal (R$)']);

    sortedMonthlyData.forEach(row => {
      creditSheet.addRow(isClientReport
        ? [row.periodo, row.creditoGerado, row.creditoAplicado, row.creditoPendente, row.saldoCredito, row.valorNotaFiscal]
        : [
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
    const movementsSheet = workbook.addWorksheet(isClientReport ? 'Detalhamento de Créditos' : 'Movimentações');
    movementsSheet.addRow([isClientReport ? 'Detalhamento dos Créditos Gerados' : 'Movimentações de Colaboradores']);
    movementsSheet.addRow([]);
    movementsSheet.addRow(isClientReport
      ? ['Mês', 'Motivo / Origem', 'Data Início', 'Data Fim', 'Colaboradores', 'Situação', 'Crédito Gerado (R$)']
      : ['Mês', 'Status / Origem', 'Data Início', 'Data Fim', 'Status Técnico', 'Colaboradores Afetados', 'Estado', 'Valor Crédito (R$)']);

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
      movements
        .filter(mov => !isClientReport || mov.valorCredito > 0)
        .forEach(mov => {
          const collaboratorLabel = mov.colaboradores.length > 0
            ? mov.colaboradores.slice(0, 3).join(', ') + (mov.colaboradores.length > 3 ? ` (+${mov.colaboradores.length - 3})` : '')
            : 'N/A';
          const stateLabel = mov.estado === 'financeiro'
            ? (isClientReport ? 'Registrado' : 'Lançamento financeiro')
            : mov.estado === 'ativo'
              ? 'Em andamento'
              : mov.estado === 'concluido'
                ? 'Concluído'
                : (isClientReport ? 'Programado' : 'Pendente');
          const originLabel = isClientReport && mov.estado === 'financeiro'
            ? 'Outros créditos operacionais'
            : mov.valorNovo;
          const endDateLabel = isClientReport && mov.fim === '9999-12-31'
            ? 'Permanente'
            : formatIsoDate(mov.fim);

          movementsSheet.addRow(isClientReport
            ? [
                fullPeriodLabel(periodName).replace(/^./, char => char.toUpperCase()),
                originLabel,
                formatIsoDate(mov.inicio),
                endDateLabel,
                collaboratorLabel,
                stateLabel,
                mov.valorCredito,
              ]
            : [
                fullPeriodLabel(periodName).replace(/^./, char => char.toUpperCase()),
                originLabel,
                formatIsoDate(mov.inicio),
                endDateLabel,
                mov.estado,
                collaboratorLabel,
                stateLabel,
                mov.valorCredito.toFixed(2),
              ]);
        });
    });

    // Sheet 5: explicit reconciliation between the ledger and the detail above.
    const reconciliationSheet = workbook.addWorksheet(isClientReport ? 'Conferência de Créditos' : 'Conciliação');
    reconciliationSheet.addRow([isClientReport ? 'Conferência dos Créditos' : 'Conciliação de Créditos']);
    reconciliationSheet.addRow(isClientReport
      ? ['Esta conferência confirma que os créditos apresentados no histórico correspondem ao detalhamento do período.']
      : []);
    reconciliationSheet.addRow(isClientReport
      ? ['Período', 'Crédito Apurado (R$)', 'Soma do Detalhamento (R$)', 'Diferença (R$)', 'Resultado']
      : ['Período', 'Crédito no Histórico (R$)', 'Crédito Detalhado (R$)', 'Diferença (R$)', 'Status']);
    sortedMonthlyData.forEach(row => {
      const detailedCredit = (movementsByPeriod.get(row.periodo) || [])
        .reduce((sum, movement) => sum + movement.valorCredito, 0);
      const difference = Math.round((detailedCredit - row.creditoGerado) * 100) / 100;
      reconciliationSheet.addRow(isClientReport
        ? [
            row.periodo,
            row.creditoGerado,
            detailedCredit,
            difference,
            Math.abs(difference) < 0.01 ? 'Conferido' : 'Necessita revisão',
          ]
        : [
            row.periodo,
            row.creditoGerado.toFixed(2),
            detailedCredit.toFixed(2),
            difference.toFixed(2),
            Math.abs(difference) < 0.01 ? 'OK' : 'Revisar',
          ]);
    });
    reconciliationSheet.getRow(1).font = { bold: true, size: 14 };
    reconciliationSheet.getRow(3).font = { bold: true };

    const guideSheet = isClientReport ? workbook.addWorksheet('Entenda o Relatório') : null;
    if (guideSheet) {
      guideSheet.addRow(['ENTENDA O RELATÓRIO']);
      guideSheet.addRow(['Este guia apresenta, de forma simples, os principais termos utilizados no relatório financeiro.']);
      guideSheet.addRow([]);
      guideSheet.addRow(['Termo', 'O que significa']);
      guideSheet.addRow(['Valor Bruto', 'Valor total dos vales adquiridos no período, antes da aplicação de créditos.']);
      guideSheet.addRow(['Vales Não Utilizados', 'Vales que deixaram de ser utilizados após férias, afastamentos, desligamentos ou outras alterações.']);
      guideSheet.addRow(['Créditos Gerados', 'Valor financeiro correspondente aos vales não utilizados identificados no período.']);
      guideSheet.addRow(['Créditos Aplicados', 'Créditos de períodos anteriores utilizados para reduzir o valor faturado no mês.']);
      guideSheet.addRow(['Créditos a Aplicar', 'Créditos já gerados que aguardam o período previsto para utilização.']);
      guideSheet.addRow(['Valor Faturado', 'Valor bruto do período menos os créditos aplicados naquele mês.']);
      guideSheet.addRow(['Outros Créditos Operacionais', 'Créditos reais registrados por ajustes históricos, mudanças de filial ou ocorrências sem uma alteração de status exibida no detalhamento.']);
      guideSheet.addRow(['Conferência de Créditos', 'Compara o total apurado com a soma do detalhamento. O resultado esperado é “Conferido”, com diferença igual a zero.']);
      guideSheet.addRow([]);
      guideSheet.addRow(['REGRA DE APLICAÇÃO DOS CRÉDITOS']);
      guideSheet.addRow(['Os créditos gerados em um mês são aplicados dois meses depois. Exemplo: um crédito gerado em agosto será aplicado em outubro.']);
    }

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

    if (isClientReport && guideSheet) {
      const titleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } };
      const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } };
      const sectionFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } };
      const whiteBoldFont = { bold: true, color: { argb: 'FFFFFFFF' } };
      const lightBorder = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };

      summarySheet.mergeCells('A1:B1');
      monthlySheet.mergeCells('A1:I1');
      creditSheet.mergeCells('A1:F1');
      movementsSheet.mergeCells('A1:G1');
      reconciliationSheet.mergeCells('A1:E1');
      reconciliationSheet.mergeCells('A2:E2');
      guideSheet.mergeCells('A1:B1');
      guideSheet.mergeCells('A2:B2');
      guideSheet.mergeCells('A14:B14');

      for (const sheet of [summarySheet, monthlySheet, creditSheet, movementsSheet, reconciliationSheet, guideSheet]) {
        sheet.views = [{ showGridLines: false }];
        sheet.getRow(1).height = 28;
        sheet.getRow(1).fill = titleFill;
        sheet.getRow(1).font = { ...whiteBoldFont, size: 15 };
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };
      }

      for (const row of [companyHeaderRow, metadataHeaderRow, executiveHeaderRow]) {
        row.fill = sectionFill;
        row.font = { bold: true, color: { argb: 'FF0F172A' } };
      }

      const styleTable = (sheet: ExcelJS.Worksheet, headerRowNumber: number) => {
        const header = sheet.getRow(headerRowNumber);
        header.height = 26;
        header.fill = headerFill;
        header.font = whiteBoldFont;
        header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
          const row = sheet.getRow(rowNumber);
          row.alignment = { vertical: 'middle' };
          row.eachCell(cell => {
            cell.border = { bottom: lightBorder };
          });
        }
        sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
        sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: sheet.columnCount } };
      };

      styleTable(monthlySheet, 3);
      styleTable(creditSheet, 3);
      styleTable(movementsSheet, 3);
      styleTable(reconciliationSheet, 3);
      styleTable(guideSheet, 4);

      monthlySheet.getColumn(1).width = 14;
      monthlySheet.getColumn(2).width = 18;
      monthlySheet.getColumn(3).width = 19;
      monthlySheet.getColumn(4).width = 22;
      for (let column = 5; column <= 8; column++) monthlySheet.getColumn(column).width = 22;
      monthlySheet.getColumn(9).width = 14;
      for (let column = 3; column <= 8; column++) monthlySheet.getColumn(column).numFmt = 'R$ #,##0.00';
      monthlySheet.getColumn(9).numFmt = '0.0%';

      creditSheet.getColumn(1).width = 14;
      for (let column = 2; column <= 6; column++) {
        creditSheet.getColumn(column).width = 23;
        creditSheet.getColumn(column).numFmt = 'R$ #,##0.00';
      }

      movementsSheet.getColumn(1).width = 20;
      movementsSheet.getColumn(2).width = 31;
      movementsSheet.getColumn(3).width = 16;
      movementsSheet.getColumn(4).width = 16;
      movementsSheet.getColumn(5).width = 42;
      movementsSheet.getColumn(6).width = 18;
      movementsSheet.getColumn(7).width = 22;
      movementsSheet.getColumn(7).numFmt = 'R$ #,##0.00';

      reconciliationSheet.getColumn(1).width = 14;
      for (let column = 2; column <= 4; column++) {
        reconciliationSheet.getColumn(column).width = 24;
        reconciliationSheet.getColumn(column).numFmt = 'R$ #,##0.00';
      }
      reconciliationSheet.getColumn(5).width = 20;
      reconciliationSheet.getRow(2).height = 34;
      reconciliationSheet.getRow(2).alignment = { wrapText: true, vertical: 'middle' };
      for (let rowNumber = 4; rowNumber <= reconciliationSheet.rowCount; rowNumber++) {
        const statusCell = reconciliationSheet.getCell(rowNumber, 5);
        const isConferred = statusCell.value === 'Conferido';
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isConferred ? 'FFDCFCE7' : 'FFFEE2E2' },
        };
        statusCell.font = { bold: true, color: { argb: isConferred ? 'FF166534' : 'FF991B1B' } };
        statusCell.alignment = { horizontal: 'center' };
      }

      summarySheet.getColumn(1).width = 34;
      summarySheet.getColumn(2).width = 34;
      summarySheet.getColumn(2).alignment = { horizontal: 'right' };
      guideSheet.getColumn(1).width = 31;
      guideSheet.getColumn(2).width = 88;
      guideSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
      guideSheet.getRow(14).fill = sectionFill;
      guideSheet.getRow(14).font = { bold: true, color: { argb: 'FF0F172A' } };
      guideSheet.getRow(15).height = 34;
      guideSheet.getRow(15).alignment = { wrapText: true, vertical: 'middle' };

      monthlySheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      movementsSheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const reportSlug = displayCompanyName.replace(/\s+/g, '-');
    const fileName = isClientReport
      ? `relatorio-financeiro-apresentacao-${reportSlug}.xlsx`
      : `relatorio-financeiro-completo-${reportSlug}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "Error generating financial report");
    res.status(500).json({ error: "Erro interno" });
  }
}

router.get("/admin/financial-report/:companyId", requireAdmin, async (req, res) => {
  await sendFinancialReport(req, res);
});

router.get(
  "/me/financial-report/:companyId",
  requireAuth("cliente_master", "cliente_subadmin"),
  async (req, res) => {
    const companyId = Number.parseInt(String(req.params.companyId), 10);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      res.status(400).json({ error: "Empresa inválida" });
      return;
    }

    try {
      const auth = getAuth(req);
      const companyIdsParam = String(req.query.companyIds ?? companyId);
      const requestedCompanyIds = [...new Set(companyIdsParam
        .split(",")
        .map(value => Number.parseInt(value.trim(), 10)))];
      if (
        requestedCompanyIds.length === 0 ||
        requestedCompanyIds.length > 100 ||
        requestedCompanyIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        !requestedCompanyIds.includes(companyId)
      ) {
        res.status(400).json({ error: "Lista de empresas inválida" });
        return;
      }
      const accessChecks = await Promise.all(requestedCompanyIds.map(id => canAccessCompany(auth, id)));
      if (accessChecks.some(allowed => !allowed)) {
        res.status(403).json({ error: "Acesso negado a uma ou mais empresas" });
        return;
      }
      await sendFinancialReport(req, res, true, requestedCompanyIds);
    } catch (err) {
      req.log.error({ err }, "Error authorizing company financial report");
      res.status(500).json({ error: "Erro interno" });
    }
  },
);

export default router;
