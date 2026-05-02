import { pgTable, serial, text, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const budgetRoutesTable = pgTable("budget_routes", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull(),
  name: text("name").notNull(),
  shiftTime: text("shift_time"),
  vehicleBlockId: integer("vehicle_block_id"),
  totalPassengers: integer("total_passengers").notNull().default(0),
  totalDistanceKm: numeric("total_distance_km", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  occupancyPct: numeric("occupancy_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
  vehicleAssignments: jsonb("vehicle_assignments").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBudgetRouteSchema = createInsertSchema(budgetRoutesTable).omit({ id: true, createdAt: true });
export type InsertBudgetRoute = z.infer<typeof insertBudgetRouteSchema>;
export type BudgetRoute = typeof budgetRoutesTable.$inferSelect;
