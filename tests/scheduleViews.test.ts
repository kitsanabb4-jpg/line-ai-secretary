import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import * as taskService from "../src/tasks/taskService";
import * as reminderService from "../src/reminders/reminderService";
import { executeIntent } from "../src/tools/index";
import { nowInTz } from "../src/utils/timezone";

/**
 * ทดสอบมุมมองตารางรายสัปดาห์/รายเดือน (LIST_WEEK/LIST_MONTH) ที่ปรับปรุงใหม่
 * ปัญหาเดิม: ข้อมูลหลายวันถูกเรียงด้วย string เวลา (HH:mm) ล้วน ๆ โดยไม่สนวันที่จริง ทำให้ลำดับสับสน
 * และไม่มีหัวข้อบอกว่าแต่ละรายการอยู่วันไหน — งานที่ยังไม่กำหนดวันก็หายไปจากมุมมองเหล่านี้ไปเลย
 */
describe("ตารางรายสัปดาห์/รายเดือน — จัดกลุ่มตามวันที่จริง", () => {
  it("LIST_WEEK จัดกลุ่มตามวันที่ พร้อมหัวข้อวันนี้/พรุ่งนี้ และเรียงตามเวลาจริงข้ามวันได้ถูกต้อง", async () => {
    const user = await createTestUser("week-view");

    // ตั้งใจสร้างสลับลำดับ (พรุ่งนี้เช้าก่อน แล้วค่อยวันนี้ดึก) เพื่อทดสอบว่าเรียงตามวันที่จริง ไม่ใช่ string เวลา
    await reminderService.createReminder(user.id, {
      title: "ประชุมทีมตอนเช้า",
      reminderTime: nowInTz().add(1, "day").hour(9).minute(0).second(0).toDate(),
    });
    await reminderService.createReminder(user.id, {
      title: "โทรหาลูกค้าตอนดึก",
      reminderTime: nowInTz().hour(20).minute(0).second(0).toDate(),
    });
    await taskService.createTask(user.id, { title: "งานที่ยังไม่กำหนดวัน" });

    const result = await executeIntent(user.id, "LIST_WEEK", {});

    expect(result.reply).toContain("วันนี้");
    expect(result.reply).toContain("พรุ่งนี้");
    expect(result.reply).toContain("งานที่ยังไม่กำหนดวัน");
    expect(result.reply).toContain("โทรหาลูกค้าตอนดึก");
    expect(result.reply).toContain("ประชุมทีมตอนเช้า");

    // "วันนี้" (โทรหาลูกค้าตอนดึก) ต้องมาก่อน "พรุ่งนี้" (ประชุมทีมตอนเช้า) แม้เวลาโมงจะ "ดึกกว่า" ก็ตาม
    // เพราะเรียงตามวันที่จริงเป็นหลัก ไม่ใช่ตัวเลขเวลาเฉย ๆ
    const idxToday = result.reply.indexOf("โทรหาลูกค้าตอนดึก");
    const idxTomorrow = result.reply.indexOf("ประชุมทีมตอนเช้า");
    expect(idxToday).toBeGreaterThan(-1);
    expect(idxTomorrow).toBeGreaterThan(idxToday);
  });

  it("LIST_MONTH คืนรายการที่อยู่ในเดือนนี้เท่านั้น (ไม่รวมเดือนหน้า)", async () => {
    const user = await createTestUser("month-view");
    const endOfMonth = nowInTz().endOf("month").subtract(1, "hour").toDate();
    const nextMonth = nowInTz().add(1, "month").toDate();

    await taskService.createTask(user.id, { title: "งานท้ายเดือนนี้", dueDate: endOfMonth });
    await taskService.createTask(user.id, { title: "งานเดือนหน้า", dueDate: nextMonth });

    const data = await taskService.listMonth(user.id);
    const titles = data.tasks.map((t) => t.title);
    expect(titles).toContain("งานท้ายเดือนนี้");
    expect(titles).not.toContain("งานเดือนหน้า");
  });

  it("ไม่มีอะไรในระบบเลย -> ตอบข้อความว่างสุภาพ ไม่ error", async () => {
    const user = await createTestUser("month-view-empty");
    const result = await executeIntent(user.id, "LIST_MONTH", {});
    expect(result.reply).toContain("ไม่มีอะไรในระบบเลยค่ะ");
  });
});
