import { Router, Request, Response } from "express";
import { env } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    demoMode: env.DEMO_MODE,
    aiProvider: env.DEMO_MODE ? "mock" : env.AI_PROVIDER,
    sttProvider: env.DEMO_MODE ? "mock" : env.STT_PROVIDER,
    time: new Date().toISOString(),
  });
});
