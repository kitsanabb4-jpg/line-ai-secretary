import axios from "axios";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";

function authHeaders() {
  return { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" };
}

interface LineMessage {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** ส่งข้อความตอบกลับแบบ reply (ใช้ replyToken ได้ครั้งเดียว ฟรี ไม่จำกัดโควต้าแบบ push) */
export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  if (env.DEMO_MODE) {
    logger.info("[DEMO] reply message", { replyToken, messages });
    return { demo: true, messages };
  }
  try {
    await axios.post(`${LINE_API}/message/reply`, { replyToken, messages }, { headers: authHeaders() });
  } catch (err: any) {
    logger.error("LINE replyMessage failed", err?.response?.data || err);
    throw err;
  }
}

/** ส่งข้อความแบบ push (มีโควต้าฟรีจำกัดต่อเดือน ใช้สำหรับแจ้งเตือนที่ AI ไม่ได้อยู่ในบทสนทนา) */
export async function pushMessage(lineUserId: string, messages: LineMessage[]) {
  if (env.DEMO_MODE) {
    logger.info("[DEMO] push message", { lineUserId, messages });
    return { demo: true, messages };
  }
  try {
    await axios.post(`${LINE_API}/message/push`, { to: lineUserId, messages }, { headers: authHeaders() });
  } catch (err: any) {
    logger.error("LINE pushMessage failed", err?.response?.data || err);
    throw err;
  }
}

/** ดาวน์โหลดไฟล์เสียง/รูปภาพจาก LINE content API */
export async function downloadLineContent(messageId: string): Promise<Buffer> {
  if (env.DEMO_MODE) {
    // ใน demo mode ไม่มีไฟล์จริง คืน buffer ว่างไว้ (mock STT provider จะ handle เอง)
    return Buffer.from("");
  }
  const res = await axios.get(`${LINE_DATA_API}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data);
}

export function textMessage(text: string): LineMessage {
  return { type: "text", text };
}
