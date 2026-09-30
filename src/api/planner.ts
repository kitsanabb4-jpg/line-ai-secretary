import { Router, Request, Response, NextFunction } from "express";
import { getUserById } from "../users/userService";
import * as taskService from "../tasks/taskService";
import * as eventService from "../events/eventService";
import * as reminderService from "../reminders/reminderService";
import * as financeService from "../finance/financeService";
import { prisma } from "../database/client";

/**
 * REST API สำหรับ Planner Dashboard (หน้าเว็บง่าย ๆ ในตัว server เดิม — ดู src/api/plannerPage.ts)
 * ทุก endpoint ผูกกับ :userId (internal user.id ซึ่งเดายากพอสมควร ไม่ใช่ lineUserId) ใน path เสมอ
 * เพื่อทำ user isolation ให้ตรงกับหลักการเดียวกับฝั่ง LINE bot — ไม่มี endpoint ไหนข้าม user ได้
 *
 * หมายเหตุเรื่อง auth: โปรเจกต์นี้เป็นบอทผู้ช่วยส่วนตัว ไม่มีระบบ login แยกต่างหาก จึงใช้ internal user.id
 * (cuid แบบเดายาก) เป็น "token" ในตัวลิงก์ Planner ที่ส่งให้ผู้ใช้ทาง LINE เอง (ดู quickReply.ts + handlers.ts)
 * ถ้าต้องการความปลอดภัยสูงกว่านี้ในอนาคต ควรเพิ่ม token แยกต่างหากที่ revoke ได้
 */
export const plannerApiRouter = Router();

async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await getUserById(req.params.userId);
  if (!user) {
    res.status(404).json({ error: "ไม่พบผู้ใช้นี้" });
    return;
  }
  (req as any).plannerUser = user;
  next();
}

plannerApiRouter.use("/planner/:userId", requireUser);

function handleError(res: Response, err: any) {
  res.status(400).json({ error: err?.message || "เกิดข้อผิดพลาด" });
}

// ---------- Planner views (อ่านอย่างเดียว รวมข้อมูลหลายประเภทมาให้พร้อมแสดงผล) ----------
plannerApiRouter.get("/planner/:userId/today", async (req, res) => {
  try {
    res.json(await taskService.listToday(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.get("/planner/:userId/week", async (req, res) => {
  try {
    res.json(await taskService.listWeek(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.get("/planner/:userId/month", async (req, res) => {
  try {
    res.json(await taskService.listMonth(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- Tasks ----------
plannerApiRouter.get("/planner/:userId/tasks", async (req, res) => {
  try {
    res.json(await taskService.listPending(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/tasks", async (req, res) => {
  try {
    const { title, dueDate, notes } = req.body || {};
    if (!title) return res.status(400).json({ error: "ต้องระบุ title" });
    const task = await taskService.createTask(req.params.userId, {
      title,
      notes,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    res.status(201).json(task);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.put("/planner/:userId/tasks/:id", async (req, res) => {
  try {
    const { title, dueDate, notes } = req.body || {};
    const task = await taskService.updateTask(req.params.userId, req.params.id, {
      title,
      notes,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    res.json(task);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/tasks/:id/complete", async (req, res) => {
  try {
    res.json(await taskService.completeTask(req.params.userId, req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/tasks/:id/cancel", async (req, res) => {
  try {
    res.json(await taskService.cancelTask(req.params.userId, req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE = ลบถาวรจริง (ปุ่มลบใน Planner ควรให้ผู้ใช้กดยืนยันในหน้าเว็บก่อนเรียก endpoint นี้เสมอ)
plannerApiRouter.delete("/planner/:userId/tasks/:id", async (req, res) => {
  try {
    await taskService.deleteTask(req.params.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- Events ----------
plannerApiRouter.get("/planner/:userId/events", async (req, res) => {
  try {
    const events = await prisma.event.findMany({ where: { userId: req.params.userId }, orderBy: { startTime: "asc" } });
    res.json(events);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/events", async (req, res) => {
  try {
    const { title, startTime, endTime, location, notes } = req.body || {};
    if (!title || !startTime) return res.status(400).json({ error: "ต้องระบุ title และ startTime" });
    const event = await eventService.createEvent(req.params.userId, {
      title,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : undefined,
      location,
      notes,
    });
    res.status(201).json(event);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.put("/planner/:userId/events/:id", async (req, res) => {
  try {
    const { title, startTime, location, notes } = req.body || {};
    const event = await eventService.updateEvent(req.params.userId, req.params.id, {
      title,
      startTime: startTime ? new Date(startTime) : undefined,
      location,
      notes,
    });
    res.json(event);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/events/:id/complete", async (req, res) => {
  try {
    res.json(await eventService.completeEvent(req.params.userId, req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/events/:id/cancel", async (req, res) => {
  try {
    res.json(await eventService.cancelEvent(req.params.userId, req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.delete("/planner/:userId/events/:id", async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- Reminders ----------
plannerApiRouter.get("/planner/:userId/reminders", async (req, res) => {
  try {
    const reminders = await prisma.reminder.findMany({ where: { userId: req.params.userId }, orderBy: { reminderTime: "asc" } });
    res.json(reminders);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/reminders", async (req, res) => {
  try {
    const { title, reminderTime } = req.body || {};
    if (!title || !reminderTime) return res.status(400).json({ error: "ต้องระบุ title และ reminderTime" });
    const reminder = await reminderService.createReminder(req.params.userId, { title, reminderTime: new Date(reminderTime) });
    res.status(201).json(reminder);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/reminders/:id/cancel", async (req, res) => {
  try {
    res.json(await reminderService.cancelReminder(req.params.userId, req.params.id));
  } catch (err) {
    handleError(res, err);
  }
});

// ---------- Finance (รายรับ-รายจ่ายพื้นฐาน) ----------
plannerApiRouter.get("/planner/:userId/finance", async (req, res) => {
  try {
    res.json(await financeService.getFinanceRecordSummary(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.post("/planner/:userId/finance", async (req, res) => {
  try {
    const { type, amount, category, description, date } = req.body || {};
    if ((type !== "INCOME" && type !== "EXPENSE") || typeof amount !== "number") {
      return res.status(400).json({ error: 'ต้องระบุ type ("INCOME"/"EXPENSE") และ amount (ตัวเลข)' });
    }
    const record = await financeService.createFinanceRecord(req.params.userId, {
      type,
      amount,
      category,
      description,
      date: date ? new Date(date) : undefined,
    });
    res.status(201).json(record);
  } catch (err) {
    handleError(res, err);
  }
});

plannerApiRouter.delete("/planner/:userId/finance/:id", async (req, res) => {
  try {
    await financeService.deleteFinanceRecord(req.params.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});
