import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { budgetsTable } from "./budgets";

export const budgetEmployeesTable = pgTable("budget_employees", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull().references(() => budgetsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  shift: text("shift").notNull().default("manha"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BudgetEmployee = typeof budgetEmployeesTable.$inferSelect;
