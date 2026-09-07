import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import { createReminder } from "../src/reminders/reminderService";
import { runSchedulerTick } from "../src/notifications/scheduler";
import { prisma } from "../src/database/client";
import { nowInTz } from "../src/utils/timezone";

/**
 * เตือนซ้ำอัตโนมัติ (escalation) — ถ้า reminder ถูกแจ้งเตือนไปแล้วครั้งแรกแต่ผู้ใช้ไม่ตอบสนอง
 * (สถานะยังเป็น PENDING) เกิน 60 นาที ระบบต้องเตือนซ้ำให้อีกครั้งเดียวโดยอัตโนมัติ ไม่ต้องรอผู้ใช้กดเลื่อนเอง
 */
describe("Scheduler escalation — เตือนซ้ำถ้าไม่ตอบสนองภายใน 1 ชั่วโมง", () => {
  it("reminder ที่แจ้งเตือนไปแล้วครั้งเดียวและเลยมา 60+ นาทีโดยยังไม่ตอบ -> เตือนซ้ำอีกครั้ง (escalation)", async () => {
    const user = await createTestUser("escalation-due");
    const reminder = await createReminder(user.id, {
      title: "ส่งรายงาน",
      reminderTime: nowInTz().subtract(90, "minute").toDate(),
    });
    // createReminder ยิง queueNotification (สถานะ QUEUED) ให้อัตโนมัติอยู่แล้ว — ลบทิ้งก่อน
    // เพื่อจำลองสถานการณ์ให้ชัดเจนว่า "เตือนไปแล้วครั้งเดียว (SENT)" แทนที่จะปนกับตัวที่ยังไม่ส่ง
    await prisma.notification.deleteMany({ where: { reminderId: reminder.id } });

    // จำลองว่าแจ้งเตือนครั้งแรกไปแล้ว (SENT) แต่ผู้ใช้ยังไม่กดตอบสนองอะไรเลย (status ยังเป็น PENDING)
    await prisma.notification.create({
      data: {
        userId: user.id,
        reminderId: reminder.id,
        message: reminder.title,
        scheduledAt: nowInTz().subtract(90, "minute").toDate(),
        sentAt: nowInTz().subtract(90, "minute").toDate(),
        status: "SENT",
      },
    });

    const result = await runSchedulerTick();
    expect(result.escalated).toBe(1);

    const notifications = await prisma.notification.findMany({ where: { reminderId: reminder.id } });
    expect(notifications.length).toBe(2); // ครั้งแรก + เตือนซ้ำ 1 ครั้ง
  });

  it("เตือนซ้ำไปแล้วครั้งหนึ่ง -> ไม่เตือนซ้ำซ้ำอีก (กันสแปม)", async () => {
    const user = await createTestUser("escalation-nospam");
    const reminder = await createReminder(user.id, {
      title: "ประชุมทีม",
      reminderTime: nowInTz().subtract(150, "minute").toDate(),
    });
    await prisma.notification.deleteMany({ where: { reminderId: reminder.id } });

    // จำลองว่าเตือนไปแล้ว 2 ครั้ง (ครั้งแรก + เตือนซ้ำรอบก่อนหน้า) แต่ผู้ใช้ก็ยังไม่ตอบสนอง
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          reminderId: reminder.id,
          message: reminder.title,
          scheduledAt: nowInTz().subtract(150, "minute").toDate(),
          sentAt: nowInTz().subtract(150, "minute").toDate(),
          status: "SENT",
        },
        {
          userId: user.id,
          reminderId: reminder.id,
          message: reminder.title,
          scheduledAt: nowInTz().subtract(90, "minute").toDate(),
          sentAt: nowInTz().subtract(90, "minute").toDate(),
          status: "SENT",
        },
      ],
    });

    const result = await runSchedulerTick();
    expect(result.escalated).toBe(0);

    const notifications = await prisma.notification.findMany({ where: { reminderId: reminder.id } });
    expect(notifications.length).toBe(2); // ต้องไม่เพิ่มขึ้นอีก
  });

  it("reminder ที่กดเสร็จแล้ว (status ไม่ใช่ PENDING) แม้จะยังไม่ถึง 60 นาทีก็ไม่ต้องเตือนซ้ำ", async () => {
    const user = await createTestUser("escalation-completed");
    const reminder = await createReminder(user.id, {
      title: "ทำการบ้าน",
      reminderTime: nowInTz().subtract(90, "minute").toDate(),
    });
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "COMPLETED" } });
    await prisma.notification.deleteMany({ where: { reminderId: reminder.id } });
    await prisma.notification.create({
      data: {
        userId: user.id,
        reminderId: reminder.id,
        message: reminder.title,
        scheduledAt: nowInTz().subtract(90, "minute").toDate(),
        sentAt: nowInTz().subtract(90, "minute").toDate(),
        status: "SENT",
      },
    });

    const result = await runSchedulerTick();
    expect(result.escalated).toBe(0);
  });
});
