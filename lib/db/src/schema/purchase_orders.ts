import { pgTable, text, serial, timestamp, integer, bigint, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
