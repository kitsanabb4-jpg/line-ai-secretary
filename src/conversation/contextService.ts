import { prisma } from "../database/client";

/**
 * เก็บ state การสนทนาล่าสุดต่อ user เพื่อรองรับ:
 *  - Slot filling: "พรุ่งนี้ต้องส่งเอกสาร" -> AI ถามเวลา -> user ตอบ "สิบโมง" -> ต้องรู้ว่าเติมเข้า reminder เดิม
 *  - อ้างอิงแบบ "อันนั้น"/"เมื่อกี้": ต้องรู้ว่ากำลังพูดถึง task/reminder ตัวไหน
 */

export async function getConversationState(userId: string) {
  return prisma.conversation.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function setPendingIntent(userId: string, intent: string, params: Record<string, unknown>) {
  const existing = await prisma.conversation.findFirst({ where: { userId } });
  const data = { pendingIntent: intent, pendingParams: JSON.stringify(params) };
  if (existing) {
    return prisma.conversation.update({ where: { id: existing.id }, data });
  }
  return prisma.conversation.create({ data: { userId, ...data } });
}

export async function clearPendingIntent(userId: string) {
  const existing = await prisma.conversation.findFirst({ where: { userId } });
  if (!existing) return;
  return prisma.conversation.update({ where: { id: existing.id }, data: { pendingIntent: null, pendingParams: null } });
}

export async function setLastEntityRef(userId: string, ref: { type: "task" | "reminder"; id: string; title: string }) {
  const existing = await prisma.conversation.findFirst({ where: { userId } });
  const data = { lastEntityRef: JSON.stringify(ref) };
  if (existing) {
    return prisma.conversation.update({ where: { id: existing.id }, data });
  }
  return prisma.conversation.create({ data: { userId, ...data } });
}

export async function getLastEntityRef(userId: string): Promise<{ type: "task" | "reminder"; id: string; title: string } | null> {
  const state = await prisma.conversation.findFirst({ where: { userId } });
  if (!state?.lastEntityRef) return null;
  try {
    return JSON.parse(state.lastEntityRef);
  } catch {
    return null;
  }
}
