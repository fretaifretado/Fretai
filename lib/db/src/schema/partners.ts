import { pgTable, text, serial, timestamp, integer, pgEnum, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["mini_van", "van", "micro_onibus", "onibus"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["ativo", "inativo"]);
export const domicileTypeEnum = pgEnum("domicile_type", ["same_as_partner", "different"]);

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cnpj: text("cnpj").notNull().unique(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  masterUserId: integer("master_user_id"),
  /** Endereço textual da garagem (usado no frontend) */
  garageAddress: text("garage_address"),
  /** Coordenadas da garagem para cálculo de rotas */
  garageLat: doublePrecision("garage_lat"),
  garageLng: doublePrecision("garage_lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id),
  type: vehicleTypeEnum("type").notNull(),
  capacity: integer("capacity").notNull(),
  plate: text("plate").notNull().unique(),
  internalId: text("internal_id"),
  status: vehicleStatusEnum("status").notNull().default("ativo"),

  /* ── Domicílio de saída para rota ── */
  domicileType: domicileTypeEnum("domicile_type").notNull().default("same_as_partner"),
  domicileStreet: text("domicile_street"),
  domicileNumber: text("domicile_number"),
  domicileComplement: text("domicile_complement"),
  domicileNeighborhood: text("domicile_neighborhood"),
  domicileCity: text("domicile_city"),
  domicileState: text("domicile_state"),
  domicileZip: text("domicile_zip"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id),
  name: text("name").notNull(),
  cpf: text("cpf").notNull().unique(),
  cnh: text("cnh").notNull(),
  cnhCategory: text("cnh_category").notNull(),
  email: text("email").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;