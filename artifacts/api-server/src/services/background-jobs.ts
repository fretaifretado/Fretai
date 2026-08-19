import { logger } from "../lib/logger";
import { advanceAllScheduledMovements } from "../routes/scheduled-movements";
import { processAllAutomaticPurchases } from "./purchase-automation";

let schedulesRunning = false;
let purchasesRunning = false;

async function runSchedules(): Promise<void> {
  if (schedulesRunning) return;
  schedulesRunning = true;
  try {
    await advanceAllScheduledMovements();
  } catch (err) {
    logger.error({ err }, "Background scheduled movements failed");
  } finally {
    schedulesRunning = false;
  }
}

async function runPurchases(): Promise<void> {
  if (purchasesRunning) return;
  purchasesRunning = true;
  try {
    const inserted = await processAllAutomaticPurchases();
    if (inserted > 0) logger.info({ inserted }, "Automatic purchase orders created");
  } catch (err) {
    logger.error({ err }, "Background purchase automation failed");
  } finally {
    purchasesRunning = false;
  }
}

export function startBackgroundJobs(): void {
  void runSchedules();
  void runPurchases();

  const scheduleTimer = setInterval(() => void runSchedules(), 60_000);
  const purchaseTimer = setInterval(() => void runPurchases(), 5 * 60_000);
  scheduleTimer.unref();
  purchaseTimer.unref();
}
