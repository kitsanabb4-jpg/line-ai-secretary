import { prisma } from "../database/client";

export async function createEvent(userId: string, data: { title: string; startTime: Date; endTime?: Date; location?: string; notes?: string }) {
  return prisma.event.create({ data: { userId, ...data } });
}

/** หานัดหมายล่าสุด (ใช้ตอนต้องอ้างอิงแบบ "อันนั้น"/"นัดที่เพิ่งพูดถึง") */
export async function findLatestEvent(userId: string) {
  return prisma.event.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function updateEvent(userId: string, eventId: string, data: { title?: string; startTime?: Date; location?: string; notes?: string }) {
  const event = await prisma.event.findFirst({ where: { id: eventId, userId } });
  if (!event) throw new Error("ไม่พบนัดหมายนี้ หรือไม่ใช่ของคุณ");
  return prisma.event.update({ where: { id: eventId }, data });
}

export async function deleteEvent(userId: string, eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, userId } });
  if (!event) throw new Error("ไม่พบนัดหมายนี้ หรือไม่ใช่ของคุณ");
  return prisma.event.delete({ where: { id: eventId } });
}
