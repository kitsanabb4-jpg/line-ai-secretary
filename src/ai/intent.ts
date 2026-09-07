import { getAIProvider } from "./index";
import { buildSystemPrompt } from "./prompts/systemPrompt";
import { safeParseIntentJson, IntentResult } from "../utils/validation";
import { nowInTz } from "../utils/timezone";
import { prisma } from "../database/client";
import * as convo from "../conversation/contextService";
import { executeIntent } from "../tools/index";
import { logger } from "../utils/logger";

/**
 * จุดศูนย์กลางของ "สมอง" ระบบ: รับข้อความ (จาก text หรือแปลงจากเสียงแล้ว) -> ให้ AI จำแนก intent
 * -> merge กับบริบทการสนทนาที่ค้างอยู่ (slot filling) -> เรียก tool layer -> คืนข้อความตอบกลับ
 */
export async function handleUserMessage(userId: string, text: string): Promise<string> {
  const provider = getAIProvider();
  const state = await convo.getConversationState(userId);

  let recentContext = "";
  let pendingIntent: string | null = null;
  let pendingParams: Record<string, unknown> = {};
  if (state?.pendingIntent) {
    pendingIntent = state.pendingIntent;
    try {
      pendingParams = state.pendingParams ? JSON.parse(state.pendingParams) : {};
    } catch {
      pendingParams = {};
    }
    recentContext = `ก่อนหน้านี้กำลังรวบรวมข้อมูลสำหรับ intent=${pendingIntent} params ที่มีแล้ว=${JSON.stringify(pendingParams)} ผู้ใช้เพิ่งตอบข้อความล่าสุดมาเพื่อเติมข้อมูลนี้`;
  }

  const systemPrompt = buildSystemPrompt(nowInTz().format("YYYY-MM-DD HH:mm"), nowInTz().format("Z"), recentContext);

  let aiResult: IntentResult | null = null;
  try {
    const raw = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ]);
    aiResult = safeParseIntentJson(raw);
  } catch (err) {
    logger.error("AI provider chat failed", err);
  }

  if (!aiResult) {
    // AI ล้มเหลวหรือ parse ไม่ได้ -> fallback สุภาพ ไม่ทำให้ระบบล่ม
    return "ขอโทษค่ะ ตอนนี้ระบบ AI มีปัญหาเล็กน้อย ลองพิมพ์ใหม่อีกครั้งได้ไหมคะ 🐷🙏";
  }

  await prisma.message.create({ data: { userId, direction: "IN", channel: "TEXT", content: text, intent: aiResult.intent } });

  let intent = aiResult.intent;
  let params: Record<string, unknown> = { ...aiResult.params, rawText: text };

  // ถ้ามี pending intent ค้างอยู่ ให้ merge ข้อมูลเก่ากับใหม่ (กันไม่ให้ถามซ้ำ)
  if (pendingIntent) {
    intent = intent === "GENERAL_CONVERSATION" ? pendingIntent : intent;
    params = { ...pendingParams, ...aiResult.params, rawText: text };
  }

  let replyText: string;

  if (aiResult.needsClarification && aiResult.clarifyingQuestion) {
    await convo.setPendingIntent(userId, intent, params);
    replyText = aiResult.clarifyingQuestion;
  } else {
    try {
      const result = await executeIntent(userId, intent, params);
      replyText = result.reply || aiResult.reply || "รับทราบค่ะ 🐷";
    } catch (err: any) {
      logger.error("executeIntent failed", err);
      replyText = `ขอโทษค่ะ ${err?.message || "เกิดข้อผิดพลาดบางอย่าง"} 🙏`;
    }
  }

  await prisma.message.create({ data: { userId, direction: "OUT", channel: "TEXT", content: replyText } });
  return replyText;
}
