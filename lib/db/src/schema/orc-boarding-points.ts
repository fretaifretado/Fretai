import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orcBoardingPointsTable = pgTable("orc_boarding_points", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").notNull(),
  routeId: integer("route_id"),
  name: text("name").notNull(),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  passengerCount: integer("passenger_count").notNull().default(0),
  sequenceOrder: integer("sequence_order"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrcBoardingPointSchema = createInsertSchema(orcBoardingPointsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrcBoardingPoint = z.infer<typeof insertOrcBoardingPointSchema>;
export type OrcBoardingPoint = typeof orcBoardingPointsTable.$inferSelect;
