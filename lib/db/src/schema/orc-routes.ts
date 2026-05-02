import { pgTable, serial, text, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orcRoutesTable = pgTable("orc_routes", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull(),
  name: text("name").notNull(),
  shiftTime: text("shift_time"),
  direction: text("direction").notNull().default("ida"),
  vehicleBlockId: integer("vehicle_block_id"),
  totalPassengers: integer("total_passengers").notNull().default(0),
  totalDistanceKm: numeric("total_distance_km", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  occupancyPct: numeric("occupancy_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
  vehicleAssignments: jsonb("vehicle_assignments").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrcRouteSchema = createInsertSchema(orcRoutesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrcRoute = z.infer<typeof insertOrcRouteSchema>;
export type OrcRoute = typeof orcRoutesTable.$inferSelect;
