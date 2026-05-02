import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const budgetWorkersTable = pgTable("budget_workers", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  shift: text("shift"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  geocoded: boolean("geocoded").notNull().default(false),
  boardingPointId: integer("boarding_point_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBudgetWorkerSchema = createInsertSchema(budgetWorkersTable).omit({ id: true, createdAt: true });
export type InsertBudgetWorker = z.infer<typeof insertBudgetWorkerSchema>;
export type BudgetWorker = typeof budgetWorkersTable.$inferSelect;
