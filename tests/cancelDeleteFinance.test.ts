import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import { executeIntent } from "../src/tools/index";
import * as taskService from "../src/tasks/taskService";
import * as eventService from "../src/events/eventService";
import * as financeService from "../src/finance/financeService";
import { prisma } from "../src/database/client";
import { nowInTz } from "../src/utils/timezone";

/**
 * ทดสอบส่วนที่เพิ่มใหม่ตาม spec "Planner upgrade": แยก CANCEL (เก็บประวัติ) ออกจาก DELETE (ลบถาวร ต้องยืนยันก่อน)
 * และสมุดบันทึกรายรับ-รายจ่ายพื้นฐาน (FinanceRecord)
 */
describe("CANCEL_ITEM — ยกเลิกทันที เก็บประวัติไว้ ไม่ต้องยืนยัน", () => {
  it("ยกเลิกงาน -> status เป็น CANCELLED และมี cancelledAt แต่ยังอยู่ในระบบ (ไม่ถูกลบ)", async () => {
    const user = await createTestUser("cancel-task");
    const task = await taskService.createTask(user.id, { title: "ส่งรายงาน" });

    const result = await executeIntent(user.id, "CANCEL_ITEM", { targetRef: "ส่งรายงาน" });
    expect(result.reply).toContain("ยกเลิก");

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe("CANCELLED");
    expect(updated?.cancelledAt).not.toBeNull();
  });

  it("ยกเลิกนัดหมาย -> event ยังอยู่ในระบบแต่ status เป็น CANCELLED และไม่โผล่ในมุมมองสัปดาห์อีก", async () => {
    const user = await createTestUser("cancel-event");
    const event = await eventService.createEvent(user.id, { title: "นัดหมอ", startTime: nowInTz().add(1, "day").toDate() });

    await executeIntent(user.id, "CANCEL_ITEM", { targetRef: "นัดหมอ" });
    const updated = await prisma.event.findUnique({ where: { id: event.id } });
    expect(updated?.status).toBe("CANCELLED");

    const week = await taskService.listWeek(user.id);
    expect(week.events.find((e) => e.id === event.id)).toBeUndefined();
  });
});

describe("DELETE_TASK บนงาน/นัดหมาย — ต้องถามยืนยันก่อนลบถาวรเสมอ", () => {
  it("ขอลบงาน -> ถามยืนยันก่อน ไม่ลบทันที จนกว่าจะตอบยืนยัน", async () => {
    const user = await createTestUser("delete-confirm");
    const task = await taskService.createTask(user.id, { title: "งานทดสอบลบ" });

    const askResult = await executeIntent(user.id, "DELETE_TASK", { targetRef: "งานทดสอบลบ" });
    expect(askResult.reply).toContain("ยืนยัน");

    // ยังไม่ถูกลบ เพราะยังไม่ได้ยืนยัน
    const stillThere = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stillThere).not.toBeNull();

    // ตอบยืนยัน (จำลอง params ที่ intent.ts จะ merge มาจาก pendingParams ให้ตอน isConfirmDeleteFlow)
    const confirmResult = await executeIntent(user.id, "DELETE_TASK", {
      confirmTargetType: "task",
      confirmTargetId: task.id,
      confirmTargetTitle: task.title,
      rawText: "ยืนยัน",
    });
    expect(confirmResult.reply).toContain("ถาวร");
    const gone = await prisma.task.findUnique({ where: { id: task.id } });
    expect(gone).toBeNull();
  });

  it("ถามยืนยันแล้วตอบปฏิเสธ (ไม่ใช่คำยืนยัน) -> ไม่ลบ งานยังอยู่เหมือนเดิม", async () => {
    const user = await createTestUser("delete-reject");
    const task = await taskService.createTask(user.id, { title: "งานที่ไม่อยากลบ" });

    const rejectResult = await executeIntent(user.id, "DELETE_TASK", {
      confirmTargetType: "task",
      confirmTargetId: task.id,
      confirmTargetTitle: task.title,
      rawText: "ไม่เอาดีกว่า",
    });
    expect(rejectResult.reply).toContain("ไม่ลบ");
    const stillThere = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe("รายรับ-รายจ่ายพื้นฐาน (FinanceRecord) — แยกจาก Payment/Debt", () => {
  it("ADD_EXPENSE บันทึกรายจ่ายและรวมยอดถูกต้อง", async () => {
    const user = await createTestUser("finance-record-expense");
    await executeIntent(user.id, "ADD_EXPENSE", { title: "กาแฟ", amount: 60, rawText: "จ่ายค่ากาแฟไป 60 บาท" });
    await executeIntent(user.id, "ADD_INCOME", { title: "เงินเดือน", amount: 20000, rawText: "ได้เงินเดือนมา 20000" });

    const summary = await financeService.getFinanceRecordSummary(user.id);
    expect(summary.totalExpense).toBe(60);
    expect(summary.totalIncome).toBe(20000);
    expect(summary.balance).toBe(20000 - 60);
  });

  it("SHOW_FINANCE_RECORDS ตอบสรุปที่มีตัวเลขจริงจากฐานข้อมูล", async () => {
    const user = await createTestUser("finance-record-summary");
    await financeService.createFinanceRecord(user.id, { type: "EXPENSE", amount: 150, category: "อาหาร" });
    const result = await executeIntent(user.id, "SHOW_FINANCE_RECORDS", {});
    expect(result.reply).toContain("150");
  });

  it("ไม่มีรายการรายรับ-รายจ่ายเลย -> ตอบตามจริง ไม่ error", async () => {
    const user = await createTestUser("finance-record-empty");
    const result = await executeIntent(user.id, "SHOW_FINANCE_RECORDS", {});
    expect(result.reply).toContain("ยังไม่มี");
  });
});
