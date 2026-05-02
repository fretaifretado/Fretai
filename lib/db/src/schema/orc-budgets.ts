import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orcBudgetsTable = pgTable("orc_budgets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id").notNull(),
  status: text("status").notNull().default("draft"),
  companyAddress: text("company_address").notNull(),
  maxRadiusKm: numeric("max_radius_km", { precision: 10, scale: 2 }).notNull(),
  maxRouteMinutes: integer("max_route_minutes").notNull(),
  strategy: text("strategy").notNull().default("min_vehicles"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrcBudgetSchema = createInsertSchema(orcBudgetsTable).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertOrcBudget = z.infer<typeof insertOrcBudgetSchema>;
export type OrcBudget = typeof orcBudgetsTable.$inferSelect;
