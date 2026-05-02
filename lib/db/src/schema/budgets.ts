import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  algorithm: text("algorithm").notNull().default("maior_ocupacao"),
  companyId: integer("company_id").references(() => companiesTable.id),
  status: text("status").notNull().default("rascunho"),
  employeesCount: integer("employees_count").notNull().default(0),
  routesCount: integer("routes_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;
