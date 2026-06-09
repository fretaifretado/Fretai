import { pgTable, serial, integer, date, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const companyHolidaysTable = pgTable("company_holidays", {
  id:        serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  /** Data do feriado no formato yyyy-mm-dd */
  date:      date("date").notNull(),
  label:     text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});