import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { budgetsTable } from "./budgets";

export const budgetRouteVehiclesTable = pgTable("budget_route_vehicles", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull().references(() => budgetsTable.id, { onDelete: "cascade" }),
  vehicleLabel: text("vehicle_label").notNull(),
  vehicleColor: text("vehicle_color").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  vehicleTypeId: integer("vehicle_type_id"),
  capacity: integer("capacity").notNull().default(0),
  passengersCount: integer("passengers_count").notNull().default(0),
  durationMin: integer("duration_min").notNull().default(60),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BudgetRouteVehicle = typeof budgetRouteVehiclesTable.$inferSelect;
