import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehicleTypesTable = pgTable("vehicle_types", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  capacity: integer("capacity").notNull(),
  costPerKm: numeric("cost_per_km", { precision: 10, scale: 2 }).notNull(),
  fixedCost: numeric("fixed_cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVehicleTypeSchema = createInsertSchema(vehicleTypesTable).omit({ id: true, createdAt: true });
export type InsertVehicleType = z.infer<typeof insertVehicleTypeSchema>;
export type VehicleType = typeof vehicleTypesTable.$inferSelect;
