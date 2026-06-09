import { pgTable, text, serial, timestamp, integer, date, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const movementTypeEnum = pgEnum("movement_type", [
  "ferias",
  "afastamento",
  "licenca",
  "demissao",
  "troca_rota",
]);

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: text("name").notNull(),
  cpf: text("cpf").notNull(),
  matricula: text("matricula").notNull(),
  admissionDate: date("admission_date").notNull(),
  route: text("route"),
  routeStartDate: date("route_start_date"),
  status: text("status").default("Ativo"),
  email: text("email"),
  phone: text("phone"),
  birthDate: date("birth_date"),
  address: text("address"),
  addressNumber: text("address_number"),
  addressComplement: text("address_complement"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  shiftStart: text("shift_start"),
  shiftEnd: text("shift_end"),
  operationStart: date("operation_start"),
  valeValue: text("vale_value"),
  codigo: text("codigo"),
  grupoId: integer("grupo_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    unq: unique().on(table.companyId, table.cpf),
  };
});

export const employeeMovementsTable = pgTable("employee_movements", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  type: movementTypeEnum("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  reason: text("reason"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMovementSchema = createInsertSchema(employeeMovementsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type InsertMovement = z.infer<typeof insertMovementSchema>;
export type EmployeeMovement = typeof employeeMovementsTable.$inferSelect;
