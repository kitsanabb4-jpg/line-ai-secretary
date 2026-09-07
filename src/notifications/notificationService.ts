import { prisma } from "../database/client";

export async function queueNotification(userId: string, message: string, scheduledAt: Date, reminderId?: string) {
  return prisma.notification.create({ data: { userId, message, scheduledAt, reminderId, status: "QUEUED" } });
}

export async function getDueNotifications(now: Date) {
  return prisma.notification.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    include: { user: true, reminder: true },
    orderBy: { scheduledAt: "asc" },
    take: 100, // ป้องกัน batch ใหญ่เกินไปในการ tick แต่ละครั้ง (เหมาะกับ free-tier compute time limit)
  });
}

export async function markNotificationSent(id: string) {
  return prisma.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
}

export async function markNotificationFailed(id: string) {
  return prisma.notification.update({ where: { id }, data: { status: "FAILED" } });
}
