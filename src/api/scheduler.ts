import { Router, Request, Response } from "express";
import { runSchedulerTick, runDailyBriefings } from "../notifications/scheduler";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export const schedulerRouter = Router();

/**
 * Endpoint ที่ cron ภายนอก (เช่น cron-job.org ฟรี) จะยิงเข้ามาทุก 1 นาที
 * ป้องกันด้วย secret ผ่าน query string หรือ header เพื่อไม่ให้คนอื่นยิงมั่ว ๆ ได้
 * ดูวิธีตั้งค่าใน SETUP.md หัวข้อ "Scheduler"
 */
schedulerRouter.post("/scheduler/tick", async (req: Request, res: Response) => {
  const providedSecret = req.header("x-scheduler-secret") || (req.query.secret as string);
  if (env.SCHEDULER_SECRET && providedSecret !== env.SCHEDULER_SECRET) {
    return res.status(401).json({ error: "invalid secret" });
  }
  try {
    const result = await runSchedulerTick();
    const briefingResult = await runDailyBriefings();
    res.json({ ok: true, ...result, briefings: briefingResult.sent });
  } catch (err: any) {
    logger.error("Scheduler tick failed", err);
    res.status(500).json({ ok: false, error: err?.message });
  }
});

// รองรับ GET ด้วยเผื่อบาง cron service ใช้ GET request (เช่น UptimeRobot/cron-job.org แบบง่าย)
schedulerRouter.get("/scheduler/tick", async (req: Request, res: Response) => {
  const providedSecret = req.header("x-scheduler-secret") || (req.query.secret as string);
  if (env.SCHEDULER_SECRET && providedSecret !== env.SCHEDULER_SECRET) {
    return res.status(401).json({ error: "invalid secret" });
  }
  try {
    const result = await runSchedulerTick();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    logger.error("Scheduler tick failed", err);
    res.status(500).json({ ok: false, error: err?.message });
  }
});
