import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orcVehiclesTable = pgTable("orc_vehicles", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  capacity: integer("capacity").notNull(),
  costPerKm: numeric("cost_per_km", { precision: 10, scale: 2 }),
  costPerRoute: numeric("cost_per_route", { precision: 10, scale: 2 }),
  availableCount: integer("available_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrcVehicleSchema = createInsertSchema(orcVehiclesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrcVehicle = z.infer<typeof insertOrcVehicleSchema>;
export type OrcVehicle = typeof orcVehiclesTable.$inferSelect;
