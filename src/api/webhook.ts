import { Router, Request, Response } from "express";
import { verifyLineSignature } from "../line/signature";
import { handleLineEvent } from "../line/handlers";
import { logger } from "../utils/logger";

export const webhookRouter = Router();

/**
 * LINE Webhook endpoint — ต้องตั้งค่า URL นี้ใน LINE Developers Console
 * ตรวจสอบลายเซ็นก่อนเสมอ (SECURITY requirement) โดยใช้ raw body ที่ server.ts เก็บไว้ให้ใน req.rawBody
 */
webhookRouter.post("/webhook", async (req: Request, res: Response) => {
  const signature = req.header("x-line-signature");
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!verifyLineSignature(rawBody, signature)) {
    logger.warn("Invalid LINE webhook signature — rejecting request");
    return res.status(401).send("Invalid signature");
  }

  // ตอบ 200 ทันทีก่อน เพื่อไม่ให้ LINE timeout / ส่งซ้ำ แล้วค่อยประมวลผล event เบื้องหลัง
  res.status(200).send("OK");

  const events = req.body?.events || [];
  for (const event of events) {
    handleLineEvent(event).catch((err) => logger.error("Unhandled error in handleLineEvent", err));
  }
});
