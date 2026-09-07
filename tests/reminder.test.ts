import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import * as reminderService from "../src/reminders/reminderService";
import { prisma } from "../src/database/client";
import { dayjs, APP_TZ } from "../src/utils/timezone";

describe("Reminder creation", () => {
  it("สร้าง reminder แบบ ONE_TIME พร้อม notification ที่ queue ไว้", async () => {
    const user = await createTestUser("reminder-create");
    const remindTime = dayjs().tz(APP_TZ).add(1, "day").hour(9).minute(0).second(0).toDate();

    const reminder = await reminderService.createReminder(user.id, { title: "ไปส่งเอกสาร", reminderTime: remindTime });

    expect(reminder.title).toBe("ไปส่งเอกสาร");
    expect(reminder.status).toBe("PENDING");
    expect(reminder.type).toBe("ONE_TIME");

    const notif = await prisma.notification.findFirst({ where: { reminderId: reminder.id } });
    expect(notif).not.toBeNull();
    expect(notif?.status).toBe("QUEUED");
    expect(notif?.userId).toBe(user.id);
  });

  it("สร้าง reminder หลายอันพร้อมกันได้ (เช่น ส่งเอกสาร + ซื้อของ)", async () => {
    const user = await createTestUser("reminder-multi");
    const base = dayjs().tz(APP_TZ).add(1, "day");
    const items = [
      { title: "ไปส่งเอกสาร", reminderTime: base.hour(10).minute(0).toDate() },
      { title: "ซื้อของ", reminderTime: base.hour(18).minute(0).toDate() },
    ];
    const results = await reminderService.createReminders(user.id, items);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("ไปส่งเอกสาร");
    expect(results[1].title).toBe("ซื้อของ");
  });
});

describe("Recurring reminder", () => {
  it("สร้าง reminder แบบ MONTHLY 'ทุกวันที่ 1' แล้ว roll forward ไปเดือนถัดไปได้", async () => {
    const user = await createTestUser("reminder-recurring");
    const firstOfMonth = dayjs().tz(APP_TZ).date(1).hour(9).minute(0).toDate();
    const reminder = await reminderService.createReminder(user.id, {
      title: "จ่ายค่าเช่า",
      reminderTime: firstOfMonth,
      recurrence: { type: "MONTHLY", dayOfMonth: 1 },
    });
    expect(reminder.type).toBe("MONTHLY");
    expect(reminder.recurrenceRule).toBe("DAY_OF_MONTH:1");

    const before = reminder.reminderTime;
    const rolled = await reminderService.rollForwardRecurringReminder(reminder.id);
    expect(rolled).not.toBeNull();
    expect(rolled!.reminderTime.getTime()).toBeGreaterThan(before.getTime());
    expect(dayjs(rolled!.reminderTime).tz(APP_TZ).date()).toBe(1);
  });
});

describe("Snooze", () => {
  it("เลื่อนแจ้งเตือนออกไป 60 นาที และสถานะเป็น SNOOZED", async () => {
    const user = await createTestUser("reminder-snooze");
    const reminder = await reminderService.createReminder(user.id, { title: "โทรหาลูกค้า", reminderTime: new Date() });
    const snoozed = await reminderService.snoozeReminder(user.id, reminder.id, 60);
    expect(snoozed.status).toBe("SNOOZED");
    expect(snoozed.snoozeCount).toBe(1);
    expect(snoozed.reminderTime.getTime()).toBeGreaterThan(reminder.reminderTime.getTime());
  });
});

describe("Complete", () => {
  it("ทำเครื่องหมาย reminder และ task ที่ผูกกันเป็น COMPLETED", async () => {
    const user = await createTestUser("reminder-complete");
    const task = await prisma.task.create({ data: { userId: user.id, title: "ส่งรายงาน" } });
    const reminder = await reminderService.createReminder(user.id, { title: "ส่งรายงาน", reminderTime: new Date(), taskId: task.id });

    const completed = await reminderService.completeReminder(user.id, reminder.id);
    expect(completed.status).toBe("COMPLETED");

    const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updatedTask?.status).toBe("COMPLETED");
  });
});

describe("Reschedule", () => {
  it("เลื่อน reminder ไปเวลาที่ระบุใหม่ และสถานะกลับเป็น PENDING", async () => {
    const user = await createTestUser("reminder-reschedule");
    const reminder = await reminderService.createReminder(user.id, { title: "ประชุมทีม", reminderTime: new Date() });
    const newTime = dayjs().add(3, "day").toDate();
    const updated = await reminderService.rescheduleReminder(user.id, reminder.id, newTime);
    expect(updated.status).toBe("PENDING");
    expect(updated.reminderTime.getTime()).toBe(newTime.getTime());
  });

  it("เลื่อนไป 'พรุ่งนี้' เวลาเดิมด้วย rescheduleToTomorrow", async () => {
    const user = await createTestUser("reminder-reschedule-tmr");
    const original = dayjs().tz(APP_TZ).hour(9).minute(0).second(0).millisecond(0).toDate();
    const reminder = await reminderService.createReminder(user.id, { title: "ไปธนาคาร", reminderTime: original });
    const updated = await reminderService.rescheduleToTomorrow(user.id, reminder.id);
    const expectedDay = dayjs(original).add(1, "day").format("YYYY-MM-DD");
    expect(dayjs(updated.reminderTime).tz(APP_TZ).format("YYYY-MM-DD")).toBe(expectedDay);
  });
});
