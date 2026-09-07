import { prisma } from "../database/client";
import { env } from "../config/env";

/**
 * หา user จาก LINE user ID หรือสร้างใหม่ถ้ายังไม่มี
 * นี่คือจุดเดียวที่ผูก LINE user ID เข้ากับ user ในระบบ — ทุก record ที่เกี่ยวข้องกับ user
 * จะอ้างอิงผ่าน internal user.id เท่านั้น ไม่ใช้ lineUserId ตรง ๆ ในที่อื่น
 * เพื่อป้องกันไม่ให้ user คนหนึ่งเข้าถึงข้อมูลของอีกคน (User Isolation)
 */
export async function findOrCreateUser(lineUserId: string, displayName?: string) {
  let user = await prisma.user.findUnique({ where: { lineUserId }, include: { preferences: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        lineUserId,
        displayName,
        timezone: env.APP_TIMEZONE,
        preferences: {
          create: {
            dailyBriefingEnabled: env.DEFAULT_DAILY_BRIEFING_ENABLED,
            dailyBriefingTime: env.DEFAULT_DAILY_BRIEFING_TIME,
            eveningSummaryEnabled: env.DEFAULT_EVENING_SUMMARY_ENABLED,
            eveningSummaryTime: env.DEFAULT_EVENING_SUMMARY_TIME,
          },
        },
      },
      include: { preferences: true },
    });
  }
  return user;
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, include: { preferences: true } });
}

export async function updatePreferences(userId: string, data: Partial<{ dailyBriefingEnabled: boolean; dailyBriefingTime: string; eveningSummaryEnabled: boolean; eveningSummaryTime: string }>) {
  return prisma.preference.update({ where: { userId }, data });
}

export async function listAllUsers() {
  return prisma.user.findMany({ include: { preferences: true } });
}
