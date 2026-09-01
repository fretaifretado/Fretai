import { Router } from "express";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  budgetBoardingPointsTable,
  budgetRoutesTable,
  budgetsTable,
  budgetWorkersTable,
  companiesTable,
  driversTable,
  employeesTable,
  partnersTable,
  usersTable,
  vehiclesTable,
} from "@workspace/db/schema";
import { getAuth, requireAuth } from "../middlewares/auth";
import { getEmployeeValeBalance } from "../services/financial-summary";

const router = Router();

function normalizedName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fullAddress(employee: typeof employeesTable.$inferSelect): string {
  const street = [employee.address, employee.addressNumber].filter(Boolean).join(", ");
  return [street, employee.addressComplement, employee.neighborhood, employee.city, employee.state]
    .filter(Boolean).join(" - ");
}

function timeFrom(value: string | null | undefined, position: 0 | 1): string | null {
  if (!value) return null;
  const times = value.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  return times[position]?.padStart(5, "0") ?? null;
}

function minutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour! * 60 + minute! : null;
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

router.get("/mobile/me", requireAuth("parceiro_master", "motorista"), async (req, res) => {
  const auth = getAuth(req);
  const userId = typeof auth.sub === "number" ? auth.sub : Number(auth.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Usuário inválido" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    const [driver] = auth.role === "motorista"
      ? await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1)
      : [];
    const partnerId = driver?.partnerId ?? auth.entityId;
    const [partner] = Number.isInteger(partnerId)
      ? await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId as number)).limit(1)
      : [];

    let summary: { activeVehicles: number; activeDrivers: number } | null = null;
    if (auth.role === "parceiro_master" && partner) {
      const [[vehicleCount], [driverCount]] = await Promise.all([
        db.select({ value: count() }).from(vehiclesTable).where(and(eq(vehiclesTable.partnerId, partner.id), eq(vehiclesTable.status, "ativo"))),
        db.select({ value: count() }).from(driversTable).where(and(eq(driversTable.partnerId, partner.id), eq(driversTable.isActive, true))),
      ]);
      summary = {
        activeVehicles: Number(vehicleCount?.value ?? 0),
        activeDrivers: Number(driverCount?.value ?? 0),
      };
    }

    res.json({
      user: {
        id: user.id,
        name: user.name ?? driver?.name ?? user.email.split("@")[0],
        email: user.email,
        role: user.role,
      },
      partner: partner ? {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        email: partner.email,
      } : null,
      driver: driver ? {
        id: driver.id,
        name: driver.name,
        cnh: driver.cnh,
        cnhCategory: driver.cnhCategory,
        isActive: driver.isActive,
      } : null,
      summary,
    });
  } catch (err) {
    req.log.error({ err }, "Error loading mobile identity");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/mobile/collaborator/home", requireAuth("colaborador"), async (req, res) => {
  const auth = getAuth(req);
  const employeeId = auth.entityType === "employee" && Number.isInteger(auth.entityId)
    ? auth.entityId as number
    : null;
  if (!employeeId) {
    res.status(400).json({ error: "Colaborador não vinculado" });
    return;
  }

  try {
    const [row] = await db.select({ employee: employeesTable, company: companiesTable })
      .from(employeesTable)
      .innerJoin(companiesTable, eq(companiesTable.id, employeesTable.companyId))
      .where(eq(employeesTable.id, employeeId))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Colaborador não encontrado" });
      return;
    }

    const { employee, company } = row;
    const balance = await getEmployeeValeBalance(company.id, employee.id);
    const publishedBudgets = await db.select().from(budgetsTable)
      .where(and(eq(budgetsTable.companyId, company.id), eq(budgetsTable.status, "publicado")))
      .orderBy(desc(budgetsTable.updatedAt));

    let journey: {
      date: string;
      time: string | null;
      direction: "ida" | "volta";
      pickupAddress: string;
      dropoffAddress: string;
      vehicleCode: string | null;
      vehicleType: string | null;
      routeName: string;
    } | null = null;

    if (publishedBudgets.length > 0) {
      const budgetIds = publishedBudgets.map(budget => budget.id);
      const workers = await db.select().from(budgetWorkersTable)
        .where(inArray(budgetWorkersTable.budgetId, budgetIds));
      const worker = workers.find(candidate => normalizedName(candidate.name) === normalizedName(employee.name));

      if (worker) {
        const [boardingPoint] = worker.boardingPointId
          ? await db.select().from(budgetBoardingPointsTable)
            .where(eq(budgetBoardingPointsTable.id, worker.boardingPointId)).limit(1)
          : [];
        const budget = publishedBudgets.find(candidate => candidate.id === worker.budgetId);
        const routes = await db.select().from(budgetRoutesTable)
          .where(eq(budgetRoutesTable.budgetId, worker.budgetId));
        const route = boardingPoint?.routeId
          ? routes.find(candidate => candidate.id === boardingPoint.routeId)
          : routes.find(candidate => {
              const routeTime = timeFrom(candidate.shiftTime, 0);
              return !routeTime || routeTime === timeFrom(worker.shift, 0) || routeTime === employee.shiftStart;
            });

        if (budget && route) {
          const startTime = employee.shiftStart ?? timeFrom(worker.shift, 0) ?? timeFrom(route.shiftTime, 0);
          const endTime = employee.shiftEnd ?? timeFrom(worker.shift, 1);
          const now = new Date();
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = minutes(startTime);
          const endMinutes = minutes(endTime);
          let direction: "ida" | "volta" = route.direction === "volta" ? "volta" : "ida";
          let tripTime = direction === "volta" ? endTime : startTime;
          const tripDate = new Date(now);

          if (!route.direction) {
            if (startMinutes != null && nowMinutes <= startMinutes) {
              direction = "ida";
              tripTime = startTime;
            } else if (endMinutes != null && nowMinutes <= endMinutes) {
              direction = "volta";
              tripTime = endTime;
            } else {
              direction = "ida";
              tripTime = startTime;
              tripDate.setDate(tripDate.getDate() + 1);
            }
          }

          const pointAddress = boardingPoint?.name || worker.address || fullAddress(employee);
          const companyAddress = budget.destinationAddress || company.address;
          journey = {
            date: isoDate(tripDate),
            time: tripTime,
            direction,
            pickupAddress: direction === "ida" ? pointAddress : companyAddress,
            dropoffAddress: direction === "ida" ? companyAddress : pointAddress,
            vehicleCode: route.vehicleBlockId ? String(route.vehicleBlockId).padStart(2, "0") : null,
            vehicleType: (route.vehicleAssignments as Array<{ vehicleType?: string }>)[0]?.vehicleType ?? null,
            routeName: route.name,
          };
        }
      }
    }

    res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        companyName: company.name,
        homeAddress: fullAddress(employee),
        shift: employee.route,
      },
      vouchers: { balance },
      journey,
    });
  } catch (err) {
    req.log.error({ err }, "Error loading collaborator home");
    res.status(500).json({ error: "Erro ao carregar dados do colaborador" });
  }
});

export default router;
