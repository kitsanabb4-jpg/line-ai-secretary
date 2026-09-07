import { findOrCreateUser } from "../src/users/userService";

/** สร้าง user ใหม่สำหรับแต่ละเทสต์ (lineUserId สุ่มไม่ซ้ำ) เพื่อไม่ให้ข้อมูลข้ามเทสต์ปนกัน */
export async function createTestUser(prefix = "test") {
  const lineUserId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return findOrCreateUser(lineUserId, "Test User");
}
