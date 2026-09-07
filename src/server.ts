import express from "express";
import { env } from "./config/env";
import { webhookRouter } from "./api/webhook";
import { schedulerRouter } from "./api/scheduler";
import { healthRouter } from "./api/health";
import { logger } from "./utils/logger";

const app = express();

// เก็บ raw body ไว้สำหรับตรวจสอบลายเซ็น LINE webhook (ต้องใช้ raw bytes ไม่ใช่ JSON ที่ parse แล้ว)
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use("/api", webhookRouter);
app.use("/api", schedulerRouter);
app.use("/api", healthRouter);

app.get("/", (_req, res) => {
  res.send("🐷🐱 LINE AI Personal Secretary is running. DEMO_MODE=" + env.DEMO_MODE);
});

app.listen(env.PORT, () => {
  logger.info(`Server started on port ${env.PORT}`, { demoMode: env.DEMO_MODE, aiProvider: env.DEMO_MODE ? "mock" : env.AI_PROVIDER });
});

export default app;
