import { prisma } from "../database/client";

export async function createEvent(userId: string, data: { title: string; startTime: Date; endTime?: Date; location?: string; notes?: string }) {
  return prisma.event.create({ data: { userId, ...data } });
}
