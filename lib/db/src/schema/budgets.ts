import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  algorithm: text("algorithm").notNull().default("maior_ocupacao"),
  companyId: integer("company_id").references(() => companiesTable.id),
  status: text("status").notNull().default("rascunho"),
  destinationAddress: text("destination_address"),
  maxWalkingRadiusKm: numeric("max_walking_radius_km", { precision: 5, scale: 1 }).default("2"),
  maxTravelTimeMin: integer("max_travel_time_min").default(120),
  employeesCount: integer("employees_count").notNull().default(0),
  routesCount: integer("routes_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;
