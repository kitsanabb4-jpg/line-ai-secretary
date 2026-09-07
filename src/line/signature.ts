import crypto from "crypto";
import { env } from "../config/env";

/**
 * ตรวจสอบลายเซ็น webhook ของ LINE ตามสเปกทางการ
 * https://developers.line.biz/en/reference/messaging-api/#signature-validation
 * ต้องใช้ raw body (Buffer/string ก่อน JSON.parse) ในการคำนวณ HMAC-SHA256
 */
export function verifyLineSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
  if (env.DEMO_MODE) return true; // ใน DEMO_MODE ไม่ต้องมี LINE จริง
  if (!signatureHeader || !env.LINE_CHANNEL_SECRET) return false;

  const hash = crypto
    .createHmac("sha256", env.LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");

  // ใช้ timing-safe compare กัน timing attack
  const a = Buffer.from(hash);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
