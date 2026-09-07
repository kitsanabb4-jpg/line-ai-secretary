import { prisma } from "../database/client";

/**
 * Memory service — บันทึก/ค้นหา/ลบ "ความจำ" ของผู้ใช้ (แยกตาม LINE user ID เสมอ)
 * ตัวอย่าง: "จำไว้ว่าทุกวันที่ 1 ฉันต้องจ่ายค่าเช่า"
 *
 * SQLite (ค่าเริ่มต้นของโปรเจกต์) ไม่รองรับ Prisma enum จึงเก็บฟิลด์ type เป็น String ใน schema.prisma
 * แล้วกำกับชนิดค่าที่ใช้ได้จริงด้วย TypeScript union type นี้แทน
 */
export type MemoryType = "PERSONAL" | "PREFERENCE" | "WORK" | "FINANCE" | "TASK" | "IMPORTANT_FACT";

export async function saveMemory(userId: string, content: string, type: MemoryType = "IMPORTANT_FACT", tags?: string) {
  return prisma.memory.create({ data: { userId, content, type, tags } });
}

export async function searchMemory(userId: string, query: string) {
  if (!query || query.trim().length === 0) {
    return prisma.memory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 });
  }
  return prisma.memory.findMany({
    where: { userId, content: { contains: query } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function forgetMemory(userId: string, memoryIdOrQuery: string) {
  // ลองหาโดย id ก่อน ถ้าไม่เจอลองค้นด้วยข้อความ แล้วลบตัวที่ตรงที่สุด (ล่าสุด)
  const byId = await prisma.memory.findFirst({ where: { id: memoryIdOrQuery, userId } });
  if (byId) {
    await prisma.memory.delete({ where: { id: byId.id } });
    return byId;
  }
  const match = await prisma.memory.findFirst({
    where: { userId, content: { contains: memoryIdOrQuery } },
    orderBy: { createdAt: "desc" },
  });
  if (match) {
    await prisma.memory.delete({ where: { id: match.id } });
    return match;
  }
  return null;
}

export async function getRecentMemories(userId: string, limit = 5) {
  return prisma.memory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}
