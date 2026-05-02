import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import companiesRouter from "./companies";
import partnersRouter from "./partners";
import auditRouter from "./audit";
import scheduledMovementsRouter from "./scheduled-movements";
import purchaseOrdersRouter from "./purchase-orders";
import vehicleTypesRouter from "./vehicle-types";
import budgetsRouter from "./budgets";
import orcVehiclesRouter from "./orc-vehicles.js";
import orcCompaniesRouter from "./orc-companies.js";
import orcBudgetsRouter from "./orc-budgets.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(companiesRouter);
router.use(partnersRouter);
router.use(auditRouter);
router.use(scheduledMovementsRouter);
router.use(purchaseOrdersRouter);
router.use(vehicleTypesRouter);
router.use(budgetsRouter);
router.use("/vehicles", orcVehiclesRouter);
router.use("/companies", orcCompaniesRouter);
router.use("/budgets", orcBudgetsRouter);

export default router;
