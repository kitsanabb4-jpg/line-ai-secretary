import { prisma } from "../database/client";
import { computeNextOccurrence, ParsedRecurrence } from "../nlu/thaiDate";
import { dayjs } from "../utils/timezone";
import { queueNotification } from "../notifications/notificationService";

// SQLite (ค่าเริ่มต้นของโปรเจกต์) ไม่รองรับ Prisma enum จึงเก็บฟิลด์นี้เป็น String ใน schema.prisma
// แล้วกำกับชนิดค่าที่ใช้ได้จริงด้วย TypeScript union type นี้แทน (ยังคง type-safe ในโค้ดฝั่งแอปเหมือนเดิม)
export type ReminderType = "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

/**
 * Reminder engine — ทำงานแยกจาก AI โดยสิ้นเชิง
 * AI สร้าง Reminder record ในฐานข้อมูล -> Scheduler (notifications/scheduler tick) จะเป็นคนอ่านและยิงแจ้งเตือนเอง
 * แม้ AI จะไม่ได้กำลังสนทนาอยู่ก็ตาม (ดู src/notifications/scheduler.ts)
 */

function recurrenceToRule(r?: ParsedRecurrence): { type: ReminderType; rule: string | null } {
  if (!r) return { type: "ONE_TIME", rule: null };
  switch (r.type) {
    case "DAILY":
      return { type: "DAILY", rule: null };
    case "WEEKLY":
      return { type: "WEEKLY", rule: r.weekday !== undefined ? `WEEKDAY:${r.weekday}` : null };
    case "MONTHLY":
      return { type: "MONTHLY", rule: r.dayOfMonth ? `DAY_OF_MONTH:${r.dayOfMonth}` : null };
    case "YEARLY":
      return { type: "YEARLY", rule: null };
    default:
      return { type: "ONE_TIME", rule: null };
  }
}

// รับ type เป็น string เฉยๆ (ไม่ใช่ ReminderType union) เพราะค่าที่มาจาก Prisma (SQLite) เป็น string ธรรมดา
export function ruleToRecurrence(type: string, rule: string | null): ParsedRecurrence | undefined {
  if (type === "ONE_TIME") return undefined;
  if (type === "MONTHLY" && rule?.startsWith("DAY_OF_MONTH:")) {
    return { type: "MONTHLY", dayOfMonth: parseInt(rule.split(":")[1], 10) };
  }
  if (type === "WEEKLY" && rule?.startsWith("WEEKDAY:")) {
    return { type: "WEEKLY", weekday: parseInt(rule.split(":")[1], 10) };
  }
  return { type: type as any };
}

export async function createReminder(
  userId: string,
  data: { title: string; reminderTime: Date; recurrence?: ParsedRecurrence; taskId?: string; offsetMinutes?: number }
) {
  const { type, rule } = recurrenceToRule(data.recurrence);
  const reminder = await prisma.reminder.create({
    data: {
      userId,
      title: data.title,
      reminderTime: data.reminderTime,
      type,
      recurrenceRule: rule,
      taskId: data.taskId,
      offsetMinutes: data.offsetMinutes ?? 0,
      originalTime: data.reminderTime,
    },
  });
  const notifyAt = dayjs(data.reminderTime).subtract(data.offsetMinutes ?? 0, "minute").toDate();
  await queueNotification(userId, reminder.title, notifyAt, reminder.id);
  return reminder;
}

/** สร้าง reminder หลายอันพร้อมกัน (เช่น "พรุ่งนี้สิบโมงเตือนส่งเอกสาร แล้วหกโมงเย็นเตือนซื้อของ") */
export async function createReminders(userId: string, items: { title: string; reminderTime: Date; recurrence?: ParsedRecurrence }[]) {
  const results: Awaited<ReturnType<typeof createReminder>>[] = [];
  for (const item of items) {
    results.push(await createReminder(userId, item));
  }
  return results;
}

export async function findLatestReminder(userId: string) {
  return prisma.reminder.findFirst({
    where: { userId, status: { in: ["PENDING", "SNOOZED"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateReminder(userId: string, reminderId: string, data: { title?: string; reminderTime?: Date }) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  return prisma.reminder.update({ where: { id: reminderId }, data });
}

export async function completeReminder(userId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  const updated = await prisma.reminder.update({ where: { id: reminderId }, data: { status: "COMPLETED" } });
  if (reminder.taskId) {
    await prisma.task.update({ where: { id: reminder.taskId }, data: { status: "COMPLETED" } }).catch(() => {});
  }
  return updated;
}

export async function snoozeReminder(userId: string, reminderId: string, minutes: number) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  const newTime = dayjs(new Date()).add(minutes, "minute").toDate();
  const updated = await prisma.reminder.update({
    where: { id: reminderId },
    data: { reminderTime: newTime, status: "SNOOZED", snoozeCount: { increment: 1 } },
  });
  await queueNotification(userId, updated.title, newTime, updated.id);
  return updated;
}

export async function rescheduleReminder(userId: string, reminderId: string, newTime: Date) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  const updated = await prisma.reminder.update({
    where: { id: reminderId },
    data: { reminderTime: newTime, status: "PENDING" },
  });
  await queueNotification(userId, updated.title, newTime, updated.id);
  return updated;
}

/** เลื่อนไป "พรุ่งนี้" เวลาเดิม (ใช้กับปุ่ม [พรุ่งนี้] ใน LINE reminder message) */
export async function rescheduleToTomorrow(userId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  const newTime = dayjs(reminder.reminderTime).add(1, "day").toDate();
  return rescheduleReminder(userId, reminderId, newTime);
}

export async function cancelReminder(userId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) throw new Error("ไม่พบการแจ้งเตือนนี้ หรือไม่ใช่ของคุณ");
  return prisma.reminder.update({ where: { id: reminderId }, data: { status: "CANCELLED" } });
}

/** เมื่อ reminder ซ้ำ (DAILY/WEEKLY/MONTHLY/YEARLY) ถูกส่งแจ้งเตือนไปแล้ว ให้คำนวณรอบถัดไปและ queue ต่อ */
export async function rollForwardRecurringReminder(reminderId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.type === "ONE_TIME") return null;
  const recurrence = ruleToRecurrence(reminder.type, reminder.recurrenceRule);
  if (!recurrence) return null;
  const nextTime = computeNextOccurrence(reminder.reminderTime, recurrence);
  const updated = await prisma.reminder.update({ where: { id: reminderId }, data: { reminderTime: nextTime, status: "PENDING" } });
  await queueNotification(reminder.userId, reminder.title, nextTime, reminder.id);
  return updated;
}
