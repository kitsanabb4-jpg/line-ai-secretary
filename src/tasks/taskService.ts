import { prisma } from "../database/client";
import { toAppTz, nowInTz } from "../utils/timezone";

/**
 * Task service layer — AI ห้ามแตะฐานข้อมูลตรง ๆ ต้องผ่านฟังก์ชันเหล่านี้เท่านั้น (TOOL CALLING requirement)
 * ทุกฟังก์ชันรับ userId (internal id ไม่ใช่ lineUserId) และ filter ด้วย userId เสมอ เพื่อ user isolation
 */

export async function createTask(userId: string, data: { title: string; notes?: string; dueDate?: Date; sourceText?: string }) {
  return prisma.task.create({
    data: { userId, title: data.title, notes: data.notes, dueDate: data.dueDate, sourceText: data.sourceText },
  });
}

export async function updateTask(userId: string, taskId: string, data: { title?: string; notes?: string; dueDate?: Date }) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("ไม่พบ task นี้ หรือไม่ใช่ของคุณ");
  return prisma.task.update({ where: { id: taskId }, data });
}

export async function completeTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("ไม่พบ task นี้ หรือไม่ใช่ของคุณ");
  return prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
}

export async function deleteTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("ไม่พบ task นี้ หรือไม่ใช่ของคุณ");
  return prisma.task.update({ where: { id: taskId }, data: { status: "CANCELLED" } });
}

/** หา task ล่าสุดของ user (ใช้ตอนต้องอ้างอิงแบบ "อันนั้น"/"งานที่เพิ่งพูดถึง") */
export async function findLatestOpenTask(userId: string) {
  return prisma.task.findFirst({
    where: { userId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listToday(userId: string) {
  const start = nowInTz().startOf("day").toDate();
  const end = nowInTz().endOf("day").toDate();
  const [tasks, reminders, events] = await Promise.all([
    prisma.task.findMany({ where: { userId, dueDate: { gte: start, lte: end }, status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" } }),
    prisma.reminder.findMany({ where: { userId, reminderTime: { gte: start, lte: end }, status: { in: ["PENDING", "SNOOZED"] } }, orderBy: { reminderTime: "asc" } }),
    prisma.event.findMany({ where: { userId, startTime: { gte: start, lte: end } }, orderBy: { startTime: "asc" } }),
  ]);
  return { tasks, reminders, events };
}

export async function listTomorrow(userId: string) {
  const start = nowInTz().add(1, "day").startOf("day").toDate();
  const end = nowInTz().add(1, "day").endOf("day").toDate();
  const [tasks, reminders, events] = await Promise.all([
    prisma.task.findMany({ where: { userId, dueDate: { gte: start, lte: end }, status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" } }),
    prisma.reminder.findMany({ where: { userId, reminderTime: { gte: start, lte: end }, status: { in: ["PENDING", "SNOOZED"] } }, orderBy: { reminderTime: "asc" } }),
    prisma.event.findMany({ where: { userId, startTime: { gte: start, lte: end } }, orderBy: { startTime: "asc" } }),
  ]);
  return { tasks, reminders, events };
}

export async function listWeek(userId: string) {
  const start = nowInTz().startOf("day").toDate();
  const end = nowInTz().add(7, "day").endOf("day").toDate();
  const [tasks, reminders, events] = await Promise.all([
    prisma.task.findMany({ where: { userId, dueDate: { gte: start, lte: end }, status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" } }),
    prisma.reminder.findMany({ where: { userId, reminderTime: { gte: start, lte: end }, status: { in: ["PENDING", "SNOOZED"] } }, orderBy: { reminderTime: "asc" } }),
    prisma.event.findMany({ where: { userId, startTime: { gte: start, lte: end } }, orderBy: { startTime: "asc" } }),
  ]);
  return { tasks, reminders, events };
}

export async function listPending(userId: string) {
  return prisma.task.findMany({ where: { userId, status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: { dueDate: "asc" } });
}

export async function listUpcoming(userId: string, days = 30) {
  const start = nowInTz().toDate();
  const end = nowInTz().add(days, "day").toDate();
  return prisma.reminder.findMany({ where: { userId, reminderTime: { gte: start, lte: end }, status: { in: ["PENDING", "SNOOZED"] } }, orderBy: { reminderTime: "asc" } });
}
