import { pgTable, text, serial, timestamp, integer, bigint, numeric, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "Processando",
  "Aprovado",
  "Cancelado",
]);

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: bigint("employee_id", { mode: "number" }),
  nome: text("nome").notNull(),
  turno: text("turno").notNull(),
  periodo: text("periodo").notNull(),
  dataInicio: text("data_inicio").notNull(),
  dataFim: text("data_fim").notNull(),
  dias: integer("dias").notNull(),
  vales: integer("vales").notNull(),
  valorUnit: numeric("valor_unit", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  status: purchaseOrderStatusEnum("status").notNull().default("Processando"),
  proRata: boolean("pro_rata").notNull().default(false),
  sourceKey: text("source_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  sourceKeyUnique: uniqueIndex("purchase_orders_source_key_uidx")
    .on(table.sourceKey)
    .where(sql`${table.sourceKey} IS NOT NULL`),
  employeePeriodPositiveUnique: uniqueIndex("purchase_orders_employee_period_positive_uidx")
    .on(table.companyId, table.employeeId, table.periodo)
    .where(sql`${table.employeeId} IS NOT NULL AND ${table.vales} > 0 AND ${table.status} <> 'Cancelado'`),
}));

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
