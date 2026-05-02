import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  pgEnum,
  bigint,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const scheduledMovementTypeEnum = pgEnum("scheduled_movement_type", [
  "turno",
  "status",
  "filial",
]);

export const scheduledMovementStateEnum = pgEnum("scheduled_movement_state", [
  "pendente",
  "ativo",
  "concluido",
]);

export const scheduledMovementsTable = pgTable("scheduled_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  tipo: scheduledMovementTypeEnum("tipo").notNull(),
  valorNovo: text("valor_novo").notNull(),
  filialIdNovo: integer("filial_id_novo"),
  inicio: date("inicio").notNull(),
  fim: date("fim").notNull(),
  estado: scheduledMovementStateEnum("estado").notNull().default("pendente"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scheduledMovementTargetsTable = pgTable("scheduled_movement_targets", {
  id: serial("id").primaryKey(),
  scheduledMovementId: integer("scheduled_movement_id")
    .notNull()
    .references(() => scheduledMovementsTable.id, { onDelete: "cascade" }),
  colaboradorId: bigint("colaborador_id", { mode: "number" }).notNull(),
  valorAnterior: text("valor_anterior").notNull().default(""),
  filialIdAnterior: integer("filial_id_anterior"),
  appliedAt: timestamp("applied_at"),
  revertedAt: timestamp("reverted_at"),
});

export type ScheduledMovement = typeof scheduledMovementsTable.$inferSelect;
export type ScheduledMovementTarget = typeof scheduledMovementTargetsTable.$inferSelect;
