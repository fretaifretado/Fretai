import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const companyShiftsTable = pgTable("company_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  entrada: text("entrada").notNull(),
  saida: text("saida").notNull(),
  escala: text("escala").notNull().default(""),
  tipoEscala: text("tipo_escala").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CompanyShift = typeof companyShiftsTable.$inferSelect;
