import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import { parseThaiDateTime } from "../src/nlu/thaiDate";
import { executeIntent } from "../src/tools/index";
import * as financeService from "../src/finance/financeService";
import * as taskService from "../src/tasks/taskService";
import * as reminderService from "../src/reminders/reminderService";
import * as eventService from "../src/events/eventService";
import * as contextService from "../src/conversation/contextService";
import { handleUserMessage } from "../src/ai/intent";
import { prisma } from "../src/database/client";
import { dayjs, APP_TZ, nowInTz } from "../src/utils/timezone";

// อ้างอิงเวลาคงที่: วันจันทร์ที่ 7 กันยายน 2026 เวลา 08:00 (Asia/Bangkok) — ให้ผลลัพธ์ deterministic
const REF = dayjs.tz("2026-09-07 08:00", "YYYY-MM-DD HH:mm", APP_TZ);

describe("thaiDate — วันที่แบบตัวเลขเต็ม (D/M/Y พ.ศ./ค.ศ.)", () => {
  it("'15/9/69' -> 2026-09-15 (พ.ศ. 2 หลัก)", () => {
    const r = parseThaiDateTime("15/9/69", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-15");
  });

  it("'1/10/2569' -> 2026-10-01 (พ.ศ. 4 หลัก)", () => {
    const r = parseThaiDateTime("1/10/2569", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-10-01");
  });

  it("'15-09-2026' -> 2026-09-15 (ค.ศ. 4 หลัก อยู่แล้ว)", () => {
    const r = parseThaiDateTime("15-09-2026", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-15");
  });

  it("การเงิน ค่าไฟ วันที่ 15/9/69 -> จับวันที่ได้ถูกต้องแม้มีข้อความอื่นปน", () => {
    const r = parseThaiDateTime("การเงิน ค่าไฟ วันที่ 15/9/69", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-15");
  });
});

describe("thaiDate — ชื่อเดือนไทย", () => {
  it("'วันที่ 1 ตุลาคม' -> 2026-10-01 (ไม่ระบุปี ใช้ปีปัจจุบันเพราะยังไม่ผ่าน)", () => {
    const r = parseThaiDateTime("วันที่ 1 ตุลาคม เวลา 12:00", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD HH:mm")).toBe("2026-10-01 12:00");
  });

  it("'15 ก.ย. 2569' -> 2026-09-15 (เดือนย่อ + ปี พ.ศ.)", () => {
    const r = parseThaiDateTime("15 ก.ย. 2569", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-15");
  });

  it("'1 มกราคม' ที่ผ่านไปแล้วในปีนี้ -> เลื่อนไปปีหน้าอัตโนมัติ", () => {
    const r = parseThaiDateTime("1 มกราคม", REF); // REF อยู่ในเดือน ก.ย. 2026 แล้ว
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2027-01-01");
  });

  it("'วันที่ 1 ต.ค. 69' -> ระบุปีชัดเจนไม่ต้องเดา", () => {
    const r = parseThaiDateTime("วันที่ 1 ต.ค. 69", REF);
    expect(dayjs(r!.date).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-10-01");
  });
});

describe("CREATE_PAYMENT — ข้อมูลไม่ครบก็บันทึกได้ก่อน (amount=null) แล้วถามยอดทีหลัง", () => {
  it("มีชื่อ+วันที่ ไม่มียอด -> บันทึกได้ทันที ไม่บังคับถามยอดก่อน", async () => {
    const user = await createTestUser("payment-partial");
    const result = await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าไฟ", dateText: "15/9/69" });
    expect(result.reply).toContain("ค่าไฟ");
    expect(result.reply).not.toContain("ยอดเท่าไหร่");

    const payment = await prisma.payment.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(payment).not.toBeNull();
    expect(payment!.amount).toBeNull();
    expect(dayjs(payment!.dueDate).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-15");
  });

  it("ตอบยอดเงินทีหลัง -> เติมยอดให้รายการเดิม ไม่สร้างรายการใหม่ซ้ำ", async () => {
    const user = await createTestUser("payment-fill");
    await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าไฟ", dateText: "15/9/69" });
    const payment = await prisma.payment.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

    const fillResult = await executeIntent(user.id, "FILL_PAYMENT_AMOUNT", { paymentId: payment!.id, rawText: "850" });
    expect(fillResult.reply).toContain("850");

    const countAfter = await prisma.payment.count({ where: { userId: user.id } });
    expect(countAfter).toBe(1); // ต้องไม่มีรายการใหม่ซ้ำ

    const updated = await prisma.payment.findUnique({ where: { id: payment!.id } });
    expect(updated?.amount).toBe(850);
  });

  it("มีชื่อ+ยอด แต่ไม่มีวันที่ -> ต้องถามวันที่ก่อน (ยังไม่บันทึก)", async () => {
    const user = await createTestUser("payment-nodate");
    const result = await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าเน็ต", amount: 590 });
    expect(result.reply).toMatch(/วันไหน|ครบกำหนด/);
    const count = await prisma.payment.count({ where: { userId: user.id } });
    expect(count).toBe(0);
  });

  it("มีครบทั้งชื่อ วันที่ ยอด -> บันทึกครบในครั้งเดียว ไม่ต้องถามต่อ", async () => {
    const user = await createTestUser("payment-full");
    const result = await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าโทรศัพท์", dateText: "วันที่ 15", amount: 1280 });
    expect(result.reply).toContain("1,280");
    const payment = await prisma.payment.findFirst({ where: { userId: user.id } });
    expect(payment?.amount).toBe(1280);
  });
});

describe("Context resolution ข้ามหมวด (task/reminder/payment/debt/event)", () => {
  it("targetRef ระบุชื่อรายการ (เช่น 'ค่าไฟ') -> หาเจอแม้ไม่ใช่รายการล่าสุดสุด", async () => {
    const user = await createTestUser("ctx-byname");
    await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าไฟ", dateText: "20/9/69", amount: 100 });
    await executeIntent(user.id, "CREATE_TASK", { title: "ส่งรายงาน" }); // สร้างรายการอื่นตามมาทีหลัง (ล่าสุดกว่า)

    const result = await executeIntent(user.id, "RESCHEDULE", { targetRef: "ค่าไฟ", dateText: "25/9/69" });
    expect(result.reply).toContain("ค่าไฟ");
    const payment = await prisma.payment.findFirst({ where: { userId: user.id, title: "ค่าไฟ" } });
    expect(dayjs(payment!.dueDate).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-09-25");
  });

  it("'อันนั้นเลื่อนไปวันศุกร์' (targetRef กำกวม) -> ใช้รายการล่าสุดที่เพิ่งพูดถึง ไม่ใช่รายการอื่น", async () => {
    const user = await createTestUser("ctx-generic");
    const created = await reminderService.createReminder(user.id, { title: "ส่งเอกสาร", reminderTime: nowInTz().add(1, "day").toDate() });
    await contextService.setLastEntityRef(user.id, { type: "reminder", id: created.id, title: created.title });

    const result = await executeIntent(user.id, "RESCHEDULE", { targetRef: "อันนั้น", dateText: "วันศุกร์" });
    expect(result.reply).toContain("ส่งเอกสาร");
  });

  it("พรุ่งนี้ต้องส่งเอกสาร -> AI ตอบ -> ผู้ใช้พูดแค่ 'สิบโมง' ต่อ -> ต้องเติมเวลาให้ reminder เดิม ไม่สร้างใหม่", async () => {
    const user = await createTestUser("ctx-slotfill");
    await handleUserMessage(user.id, "พรุ่งนี้เตือนส่งเอกสาร");
    await handleUserMessage(user.id, "สิบโมง");

    const reminders = await prisma.reminder.findMany({ where: { userId: user.id } });
    expect(reminders.length).toBe(1); // ต้องไม่สร้างรายการที่สองจากคำว่า "สิบโมง"
    expect(dayjs(reminders[0].reminderTime).tz(APP_TZ).format("HH:mm")).toBe("10:00");
  });

  it("ไม่มี targetRef และไม่มี lastEntityRef -> ใช้รายการที่สร้างล่าสุดสุดจากทุกหมวด", async () => {
    const user = await createTestUser("ctx-fallback");
    await taskService.createTask(user.id, { title: "งานเก่า" });
    await new Promise((r) => setTimeout(r, 5));
    const newerTask = await taskService.createTask(user.id, { title: "งานใหม่กว่า" });

    const result = await executeIntent(user.id, "COMPLETE_TASK", {});
    expect(result.reply).toContain("งานใหม่กว่า");
    const updated = await prisma.task.findUnique({ where: { id: newerTask.id } });
    expect(updated?.status).toBe("COMPLETED");
  });

  it("ลบรายการที่เป็น payment ผ่าน targetRef -> ลบ payment จริง ไม่ใช่ task/reminder อื่น", async () => {
    const user = await createTestUser("ctx-delete-payment");
    await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าประกัน", dateText: "1/10/2569", amount: 5000 });
    const result = await executeIntent(user.id, "DELETE_TASK", { targetRef: "ค่าประกัน" });
    expect(result.reply).toContain("ค่าประกัน");
    const remaining = await prisma.payment.findFirst({ where: { userId: user.id, title: "ค่าประกัน" } });
    expect(remaining).toBeNull();
  });
});

describe("FINANCIAL_SUMMARY — ต้อง query ฐานข้อมูลจริง ไม่ตอบจาก conversation เฉย ๆ", () => {
  it("สรุปยอดที่ต้องจ่ายเดือนนี้รวมเฉพาะรายการที่รู้ยอด และบอกว่ามีรายการที่ยังไม่รู้ยอดด้วย", async () => {
    const user = await createTestUser("summary-mixed");
    await financeService.createPayment(user.id, { title: "ค่าไฟ", amount: 850, dueDate: nowInTz().date(20).toDate() });
    await financeService.createPayment(user.id, { title: "ค่าน้ำ", amount: null, dueDate: nowInTz().date(22).toDate() });

    const result = await executeIntent(user.id, "FINANCIAL_SUMMARY", {});
    expect(result.reply).toContain("850");
    expect(result.reply).toContain("ยังไม่ระบุยอด");
  });

  it("ไม่มีรายการต้องจ่ายเดือนนี้ -> ตอบตามจริงว่าไม่มี ไม่ใช่ค่าคงที่ผิด ๆ", async () => {
    const user = await createTestUser("summary-empty");
    const result = await executeIntent(user.id, "FINANCIAL_SUMMARY", {});
    expect(result.reply).toContain("ไม่มีรายการที่ต้องจ่าย");
  });
});

describe("Reminder/Task title extraction — แยกชื่อสั้น ๆ ออกจากประโยคเต็ม", () => {
  it("'วันที่ 1 ตุลาคม เวลา 12:00 เตือนว่า ยกเลิก คลอสโค้ด' -> title ไม่ใช่ทั้งประโยค", async () => {
    const user = await createTestUser("title-extract-1");
    await executeIntent(user.id, "CREATE_REMINDER", { rawText: "วันที่ 1 ตุลาคม เวลา 12:00 เตือนว่า ยกเลิก คลอสโค้ด" });
    const reminder = await prisma.reminder.findFirst({ where: { userId: user.id } });
    expect(reminder!.title.length).toBeLessThan(30);
    expect(reminder!.title).toContain("ยกเลิก");
    expect(reminder!.title).not.toContain("วันที่ 1 ตุลาคม");
  });

  it("AI ส่ง title มาให้ตรง ๆ อยู่แล้ว -> ใช้ตามนั้น ไม่ต้องเดาซ้ำ", async () => {
    const user = await createTestUser("title-extract-2");
    await executeIntent(user.id, "CREATE_REMINDER", { title: "ยกเลิกคลอสโค้ด", dateText: "1 ตุลาคม", timeText: "12:00" });
    const reminder = await prisma.reminder.findFirst({ where: { userId: user.id } });
    expect(reminder!.title).toBe("ยกเลิกคลอสโค้ด");
  });
});

describe("Tool result validation — ต้องไม่โกหกว่าสำเร็จถ้าจริง ๆ ไม่สำเร็จ", () => {
  it("RESCHEDULE รายการที่ไม่มีอยู่จริง -> ต้อง throw / ไม่ตอบว่าเลื่อนสำเร็จ", async () => {
    const user = await createTestUser("validate-fail");
    // แก้ไข reminder ของคนอื่นไม่ได้ (user isolation) -> ต้อง error ออกมา ไม่ใช่เงียบแล้วตอบสำเร็จ
    const otherUser = await createTestUser("validate-other");
    const otherReminder = await reminderService.createReminder(otherUser.id, { title: "ของคนอื่น", reminderTime: new Date() });
    await expect(reminderService.rescheduleReminder(user.id, otherReminder.id, new Date())).rejects.toThrow();
  });

  it("COMPLETE_TASK ตอบ 'เสร็จแล้ว' ก็ต่อเมื่อ record ในฐานข้อมูลถูกอัปเดตจริง", async () => {
    const user = await createTestUser("validate-complete");
    const task = await taskService.createTask(user.id, { title: "งานทดสอบ" });
    const result = await executeIntent(user.id, "COMPLETE_TASK", { targetRef: "งานทดสอบ" });
    expect(result.reply).toContain("เสร็จแล้ว");
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe("COMPLETED"); // ยืนยันว่า DB เปลี่ยนจริง ไม่ใช่แค่คำตอบลอย ๆ
  });
});

describe("Event context & natural phrasing", () => {
  it("สร้างนัดหมายแล้วเลื่อนด้วยชื่อ -> ต้องอัปเดต event ไม่ใช่สร้าง task ใหม่", async () => {
    const user = await createTestUser("event-reschedule");
    await eventService.createEvent(user.id, { title: "นัดหมอฟัน", startTime: nowInTz().add(2, "day").toDate() });
    const result = await executeIntent(user.id, "RESCHEDULE", { targetRef: "นัดหมอฟัน", dateText: "วันศุกร์" });
    expect(result.reply).toContain("นัดหมอฟัน");
    const events = await prisma.event.findMany({ where: { userId: user.id } });
    expect(events.length).toBe(1);
  });

  it("คำตอบไม่ใช้คำว่า 'รับทราบค่ะ' ลอย ๆ เมื่อสร้างรายการสำเร็จ", async () => {
    const user = await createTestUser("natural-reply");
    const result = await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าไฟ", dateText: "15/9/69", amount: 850 });
    expect(result.reply).not.toBe("รับทราบค่ะ");
    expect(result.reply.length).toBeGreaterThan(5);
  });
});

describe("แก้ไขยอดเงินด้วยคำพูดสั้น ๆ ('แก้เป็น'/'เปลี่ยนเป็น')", () => {
  it("'แก้เป็น 500' ต่อจากรายการเงินล่าสุด -> แก้ยอดรายการเดิม ไม่สร้างรายการใหม่ (แม้ provider ไม่ได้แยก amount มาให้ตรง ๆ)", async () => {
    const user = await createTestUser("update-amount-shorthand");
    await executeIntent(user.id, "CREATE_PAYMENT", { title: "ค่าไฟ", dateText: "15/9/69", amount: 100 });

    const result = await executeIntent(user.id, "UPDATE_TASK", { rawText: "แก้เป็น 500" });
    expect(result.reply).toContain("ค่าไฟ");

    const count = await prisma.payment.count({ where: { userId: user.id } });
    expect(count).toBe(1); // ต้องไม่มีรายการใหม่ซ้ำ
    const payment = await prisma.payment.findFirst({ where: { userId: user.id, title: "ค่าไฟ" } });
    expect(payment?.amount).toBe(500);
  });
});
