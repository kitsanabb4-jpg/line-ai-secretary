import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import * as memoryService from "../src/memory/memoryService";
import * as taskService from "../src/tasks/taskService";
import * as reminderService from "../src/reminders/reminderService";

describe("Memory isolation (แยกความจำตาม LINE user ID)", () => {
  it("user A ค้นความจำของ user B ไม่เจอ", async () => {
    const userA = await createTestUser("memiso-a");
    const userB = await createTestUser("memiso-b");

    await memoryService.saveMemory(userA.id, "ทุกวันที่ 1 ต้องจ่ายค่าเช่า");
    await memoryService.saveMemory(userB.id, "แพ้กุ้ง ห้ามสั่งอาหารทะเล");

    const resultsA = await memoryService.searchMemory(userA.id, "ค่าเช่า");
    const resultsB = await memoryService.searchMemory(userA.id, "แพ้กุ้ง"); // user A ค้นด้วยคำของ user B

    expect(resultsA.length).toBeGreaterThan(0);
    expect(resultsA.every((m) => m.userId === userA.id)).toBe(true);
    expect(resultsB.length).toBe(0); // ต้องไม่เจอข้อมูลของ user B
  });
});

describe("User isolation (ห้าม user หนึ่งเข้าถึงข้อมูลของอีกคน)", () => {
  it("user A แก้ไข/ลบ task ของ user B ไม่ได้", async () => {
    const userA = await createTestUser("useriso-a");
    const userB = await createTestUser("useriso-b");

    const taskB = await taskService.createTask(userB.id, { title: "งานลับของ B" });

    await expect(taskService.completeTask(userA.id, taskB.id)).rejects.toThrow();
    await expect(taskService.deleteTask(userA.id, taskB.id)).rejects.toThrow();
  });

  it("user A แก้ไข/เลื่อน reminder ของ user B ไม่ได้", async () => {
    const userA = await createTestUser("useriso-a2");
    const userB = await createTestUser("useriso-b2");

    const reminderB = await reminderService.createReminder(userB.id, { title: "ความลับของ B", reminderTime: new Date() });

    await expect(reminderService.snoozeReminder(userA.id, reminderB.id, 30)).rejects.toThrow();
    await expect(reminderService.completeReminder(userA.id, reminderB.id)).rejects.toThrow();
    await expect(reminderService.rescheduleReminder(userA.id, reminderB.id, new Date())).rejects.toThrow();
  });

  it("listToday ของ user A ไม่รวมข้อมูลของ user B", async () => {
    const userA = await createTestUser("useriso-a3");
    const userB = await createTestUser("useriso-b3");
    await taskService.createTask(userB.id, { title: "งานของ B วันนี้", dueDate: new Date() });

    const dataA = await taskService.listToday(userA.id);
    expect(dataA.tasks.every((t) => t.userId === userA.id)).toBe(true);
    expect(dataA.tasks.find((t) => t.title === "งานของ B วันนี้")).toBeUndefined();
  });
});
