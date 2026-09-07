import { findOrCreateUser } from "../users/userService";
import { handleUserMessage } from "../ai/intent";
import { getSTTProvider } from "../speech";
import { downloadLineContent, replyMessage, textMessage } from "./client";
import { reminderActionButtons, mainMenuQuickReply } from "./quickReply";
import * as reminderService from "../reminders/reminderService";
import { formatThaiDateTime } from "../utils/timezone";
import { logger } from "../utils/logger";
import { isRateLimited } from "../utils/rateLimit";
import { prisma } from "../database/client";

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { userId: string; type: string };
  message?: { id: string; type: string; text?: string };
  postback?: { data: string };
}

/** จุดเข้าเดียวสำหรับทุก event ที่มาจาก LINE webhook — แยกกระจายไปตามชนิด event */
export async function handleLineEvent(event: LineEvent) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return; // ไม่ใช่ event จาก user โดยตรง (เช่น group/room ที่ไม่มี userId) — ข้าม

  const user = await findOrCreateUser(lineUserId);

  if (isRateLimited(user.id)) {
    if (event.replyToken) {
      await replyMessage(event.replyToken, [textMessage("ส่งข้อความถี่ไปหน่อยนะคะ 🐷 รอสักครู่แล้วลองใหม่นะคะ")]);
    }
    return;
  }

  try {
    if (event.type === "message" && event.message?.type === "text") {
      await handleTextMessage(user.id, event.replyToken!, event.message.text || "");
    } else if (event.type === "message" && event.message?.type === "audio") {
      await handleVoiceMessage(user.id, event.replyToken!, event.message.id);
    } else if (event.type === "message" && event.message?.type === "image") {
      await handleImageMessage(user.id, event.replyToken!, event.message.id);
    } else if (event.type === "postback") {
      await handlePostback(user.id, event.replyToken!, event.postback?.data || "");
    }
  } catch (err) {
    logger.error("handleLineEvent error", err);
    if (event.replyToken) {
      await replyMessage(event.replyToken, [textMessage("ขอโทษค่ะ เกิดข้อผิดพลาดบางอย่าง ลองใหม่อีกครั้งนะคะ 🙏")]).catch(() => {});
    }
  }
}

async function handleTextMessage(userId: string, replyToken: string, text: string) {
  logger.userMessage(userId, "IN", text);
  const reply = await handleUserMessage(userId, text);
  logger.userMessage(userId, "OUT", reply);
  await replyMessage(replyToken, [{ ...textMessage(reply), quickReply: mainMenuQuickReply() } as any]);
}

/**
 * Voice pipeline: LINE Voice -> Download audio -> Speech-to-text -> Thai text -> AI -> Intent -> Tool -> Database -> Response
 */
async function handleVoiceMessage(userId: string, replyToken: string, messageId: string) {
  const audio = await downloadLineContent(messageId);
  const stt = getSTTProvider();
  const text = await stt.transcribe(audio, "m4a");

  if (!text || text.trim().length === 0) {
    await replyMessage(replyToken, [textMessage("ฟังไม่ชัดเลยค่ะ ลองพูดใหม่อีกครั้งได้ไหมคะ 🎤")]);
    return;
  }

  await prisma.message.create({ data: { userId, direction: "IN", channel: "VOICE", content: text } });
  logger.userMessage(userId, "IN", `[VOICE] ${text}`);
  const reply = await handleUserMessage(userId, text);
  await replyMessage(replyToken, [textMessage(reply)]);
}

/** รับรูปภาพ — ตอนนี้รองรับการรับทราบว่าได้รับรูป และเก็บ log ไว้ (OCR แบบเต็มรูปแบบต้องใช้ vision-capable provider เพิ่มเติม) */
async function handleImageMessage(userId: string, replyToken: string, messageId: string) {
  await prisma.message.create({ data: { userId, direction: "IN", channel: "IMAGE", content: `[image:${messageId}]` } });
  await replyMessage(replyToken, [
    textMessage("ได้รับรูปภาพแล้วค่ะ 🐷📷 ตอนนี้ยังไม่ได้เปิดใช้การอ่านข้อความจากรูปภาพ (OCR) — ดู SETUP.md วิธีเปิดใช้งานเพิ่มเติมค่ะ"),
  ]);
}

/** ปุ่ม postback บน reminder message: [เสร็จแล้ว] [เลื่อน 1 ชั่วโมง] [พรุ่งนี้] */
async function handlePostback(userId: string, replyToken: string, data: string) {
  const parts = new URLSearchParams(data);
  const action = parts.get("action");
  const id = parts.get("id");
  if (!id) return;

  if (action === "complete_reminder") {
    const r = await reminderService.completeReminder(userId, id);
    await replyMessage(replyToken, [textMessage(`เยี่ยมค่ะ ✅ "${r.title}" เสร็จแล้ว!`)]);
  } else if (action === "snooze_reminder") {
    const minutes = parseInt(parts.get("minutes") || "60", 10);
    const r = await reminderService.snoozeReminder(userId, id, minutes);
    await replyMessage(replyToken, [textMessage(`เลื่อนแจ้งเตือน "${r.title}" ออกไปแล้วค่ะ ⏰ (${formatThaiDateTime(r.reminderTime)})`)]);
  } else if (action === "reschedule_tomorrow") {
    const r = await reminderService.rescheduleToTomorrow(userId, id);
    await replyMessage(replyToken, [textMessage(`เลื่อน "${r.title}" ไปพรุ่งนี้เวลาเดิมแล้วค่ะ 📅 (${formatThaiDateTime(r.reminderTime)})`)]);
  }
}

export { reminderActionButtons };
