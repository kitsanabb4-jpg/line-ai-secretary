import { Router, Request, Response } from "express";
import { findOrCreateUser } from "../users/userService";
import { handleUserMessage } from "../ai/intent";
import { logger } from "../utils/logger";

export const testChatRouter = Router();

/**
 * Endpoint ทดสอบคุยกับ AI เลขาโดยตรงผ่าน HTTP โดยไม่ต้องผ่าน LINE จริง (ไม่ต้องตั้ง webhook/ngrok)
 * ใช้สำหรับ dev/debug เท่านั้น — ยิงด้วย curl/Postman/เบราว์เซอร์ก็ได้:
 *   curl -X POST http://localhost:3000/api/test-chat -H "Content-Type: application/json" \
 *        -d '{"userId":"demo_user","message":"การเงิน ค่าไฟ วันที่ 15/9/69"}'
 * แต่ละ userId ที่ส่งมาจะถูก map เป็น internal user คนละคนกันเสมอ (เหมือน user จริงจาก LINE)
 * เพื่อให้ยังทดสอบ context/slot-filling ข้ามข้อความได้เหมือนใช้งานจริงผ่าน LINE
 */
testChatRouter.post("/test-chat", async (req: Request, res: Response) => {
  const { userId, message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ status: "error", detail: "ต้องส่ง message เป็น string" });
  }
  const testUserId = typeof userId === "string" && userId.trim() ? userId.trim() : "demo_user";

  try {
    const user = await findOrCreateUser(`test-chat:${testUserId}`, testUserId);
    const reply = await handleUserMessage(user.id, message);
    return res.json({ status: "success", response: reply });
  } catch (err: any) {
    logger.error("Error in /test-chat", err);
    return res.status(500).json({ status: "error", detail: err?.message || "เกิดข้อผิดพลาด" });
  }
});

