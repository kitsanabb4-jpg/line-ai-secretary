import { nowInTz, formatThaiDateTime, formatThaiTime, toAppTz } from "../utils/timezone";
import { parseThaiDateTime } from "../nlu/thaiDate";
import * as taskService from "../tasks/taskService";
import * as reminderService from "../reminders/reminderService";
import * as eventService from "../events/eventService";
import * as memoryService from "../memory/memoryService";
import * as financeService from "../finance/financeService";
import * as convo from "../conversation/contextService";
import { MemoryType } from "../memory/memoryService";

export interface ToolResult {
  reply: string;
  reminderIdForButtons?: string; // ถ้ามีการสร้าง reminder ใหม่ อยากส่งปุ่ม action ให้ทันที (ไม่บังคับ)
}

interface IntentParams {
  title?: string;
  dateText?: string;
  timeText?: string;
  amount?: number | null;
  memoryType?: string;
  searchQuery?: string;
  targetRef?: string;
  creditor?: string;
  notes?: string;
  rawText?: string;
}

function formatListSection(label: string, emoji: string, items: { time: string; title: string }[]): string {
  if (items.length === 0) return "";
  const lines = items.map((i) => `${i.time} ${i.title}`).join("\n");
  return `${emoji} ${label}\n${lines}`;
}

async function buildDayReply(userId: string, dayLabel: string, data: Awaited<ReturnType<typeof taskService.listToday>>) {
  const items: { time: string; title: string }[] = [];
  for (const r of data.reminders) items.push({ time: formatThaiTime(r.reminderTime), title: r.title });
  for (const t of data.tasks.filter((t) => t.dueDate)) items.push({ time: formatThaiTime(t.dueDate!), title: t.title });
  for (const e of data.events) items.push({ time: formatThaiTime(e.startTime), title: e.title });
  items.sort((a, b) => a.time.localeCompare(b.time));

  if (items.length === 0) {
    return `${dayLabel}ไม่มีอะไรในระบบเลยค่ะ 🐷✨`;
  }
  const lines = items.map((i) => `${i.time} ${i.title}`).join("\n");
  return `${dayLabel}มี ${items.length} เรื่องค่ะ\n${lines}`;
}

/**
 * Dispatcher หลัก — รับ intent + params จาก AI แล้วเรียก service layer ที่ถูกต้อง
 * นี่คือจุดเดียวที่แปลง "ความตั้งใจ" ให้กลายเป็นการกระทำจริงในฐานข้อมูล
 */
export async function executeIntent(userId: string, intent: string, params: IntentParams): Promise<ToolResult> {
  const ref = nowInTz();

  switch (intent) {
    case "CREATE_TASK": {
      const title = params.title || params.rawText || "งานใหม่";
      let dueDate: Date | undefined;
      if (params.dateText || params.timeText) {
        const parsed = parseThaiDateTime(`${params.dateText || ""} ${params.timeText || ""}`, ref);
        dueDate = parsed?.date;
      }
      const task = await taskService.createTask(userId, { title, dueDate, sourceText: params.rawText });
      await convo.setLastEntityRef(userId, { type: "task", id: task.id, title: task.title });
      return { reply: dueDate ? `รับทราบค่ะ 📌 บันทึกงาน "${title}" กำหนด ${formatThaiDateTime(dueDate)} แล้วนะคะ` : `รับทราบค่ะ 📌 บันทึกงาน "${title}" ไว้แล้วนะคะ` };
    }

    case "CREATE_REMINDER":
    case "CREATE_RECURRING_REMINDER": {
      const combined = `${params.dateText || ""} ${params.timeText || ""} ${params.rawText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      const title = params.title || (params.rawText || "").trim() || "แจ้งเตือน";

      if (!parsed) {
        await convo.setPendingIntent(userId, "CREATE_REMINDER", { title });
        return { reply: `ต้องการให้เตือนกี่โมง หรือวันไหนดีคะ 🐷` };
      }

      const reminder = await reminderService.createReminder(userId, {
        title,
        reminderTime: parsed.date,
        recurrence: parsed.recurrence,
      });
      await convo.setLastEntityRef(userId, { type: "reminder", id: reminder.id, title: reminder.title });
      await convo.clearPendingIntent(userId);

      const recurLabel = parsed.recurrence
        ? parsed.recurrence.type === "MONTHLY" && parsed.recurrence.dayOfMonth
          ? ` ทุกวันที่ ${parsed.recurrence.dayOfMonth}`
          : parsed.recurrence.type === "DAILY"
          ? " ทุกวัน"
          : parsed.recurrence.type === "WEEKLY"
          ? " ทุกสัปดาห์"
          : " ทุกปี"
        : "";
      return { reply: `ได้เลยค่ะ 🐷⏰ ฉันจะเตือน${recurLabel ? "" : "วัน" }${formatThaiDateTime(parsed.date)}${recurLabel} เรื่อง "${title}" นะคะ`, reminderIdForButtons: reminder.id };
    }

    case "CREATE_EVENT": {
      const combined = `${params.dateText || ""} ${params.timeText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      if (!parsed) {
        await convo.setPendingIntent(userId, "CREATE_EVENT", { title: params.title });
        return { reply: "นัดหมายนี้วันไหน เวลาอะไรดีคะ 📅" };
      }
      const title = params.title || "นัดหมาย";
      const event = await eventService.createEvent(userId, { title, startTime: parsed.date, notes: params.notes });
      return { reply: `จดนัดหมายแล้วค่ะ 📅 "${title}" วันที่ ${formatThaiDateTime(event.startTime)}` };
    }

    case "CREATE_NOTE":
    case "SAVE_MEMORY": {
      const content = params.title || params.rawText || "";
      const type = (params.memoryType as MemoryType) || "IMPORTANT_FACT";
      await memoryService.saveMemory(userId, content, type);
      return { reply: `จำไว้แล้วค่ะ 🧠✅ "${content}"` };
    }

    case "SEARCH_MEMORY": {
      const query = params.searchQuery || params.rawText || "";
      const results = await memoryService.searchMemory(userId, query);
      if (results.length === 0) return { reply: "ไม่พบความจำที่เกี่ยวข้องเลยค่ะ 🐱" };
      const lines = results.map((m) => `• ${m.content}`).join("\n");
      return { reply: `เจอความจำที่เกี่ยวข้องค่ะ 🧠\n${lines}` };
    }

    case "FORGET_MEMORY": {
      const query = params.searchQuery || params.title || params.rawText || "";
      const removed = await memoryService.forgetMemory(userId, query);
      return { reply: removed ? `ลืมเรื่องนี้ให้แล้วค่ะ 🧠🗑️ "${removed.content}"` : "หาความจำที่ตรงกับที่บอกไม่เจอเลยค่ะ" };
    }

    case "CREATE_PAYMENT": {
      const combined = `${params.dateText || ""} ${params.timeText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      const title = params.title || params.rawText || "รายการที่ต้องจ่าย";
      if (!parsed) {
        await convo.setPendingIntent(userId, "CREATE_PAYMENT", { title, amount: params.amount });
        return { reply: "วันไหนต้องจ่ายดีคะ 💰" };
      }
      if (params.amount === undefined || params.amount === null) {
        await convo.setPendingIntent(userId, "CREATE_PAYMENT", { title, dateText: params.dateText });
        return { reply: "จำนวนเท่าไหร่คะ 💰" };
      }
      const payment = await financeService.createPayment(userId, {
        title,
        amount: params.amount,
        dueDate: parsed.date,
        isRecurring: !!parsed.recurrence,
        recurrenceRule: parsed.recurrence?.type,
      });
      // สร้าง reminder แจ้งเตือนวันครบกำหนดด้วย
      await reminderService.createReminder(userId, { title: `จ่าย${title} ${params.amount} บาท`, reminderTime: parsed.date, recurrence: parsed.recurrence });
      return { reply: `บันทึกแล้วค่ะ 💰 "${title}" ${params.amount} บาท กำหนด ${formatThaiDateTime(payment.dueDate)}` };
    }

    case "CREATE_DEBT": {
      const creditor = params.creditor || params.title || "เจ้าหนี้";
      const amount = params.amount || 0;
      const debt = await financeService.createDebt(userId, { creditor, originalAmount: amount });
      return { reply: `บันทึกหนี้แล้วค่ะ 💰 "${creditor}" ${amount.toLocaleString()} บาท` };
    }

    case "CREATE_MEDICATION_REMINDER": {
      const title = params.title || "ทานยา";
      const combined = `${params.timeText || ""}`.trim();
      const parsed = parseThaiDateTime(combined || "วันนี้", ref);
      const reminder = await reminderService.createReminder(userId, {
        title: `💊 ${title}`,
        reminderTime: parsed?.date || ref.toDate(),
        recurrence: { type: "DAILY" },
      });
      return { reply: `ตั้งเตือนทานยา "${title}" ทุกวันแล้วค่ะ 💊✅` };
    }

    case "COMPLETE_TASK": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target) return { reply: "ไม่แน่ใจว่าหมายถึงงานไหนค่ะ ลองบอกชื่องานอีกครั้งได้ไหมคะ 🐷" };
      if (target.type === "reminder") {
        await reminderService.completeReminder(userId, target.id);
      } else {
        await taskService.completeTask(userId, target.id);
      }
      return { reply: `เยี่ยมค่ะ ✅ "${target.title}" เสร็จแล้ว!` };
    }

    case "DELETE_TASK": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target) return { reply: "ไม่แน่ใจว่าหมายถึงงานไหนค่ะ" };
      if (target.type === "reminder") await reminderService.cancelReminder(userId, target.id);
      else await taskService.deleteTask(userId, target.id);
      return { reply: `ลบ "${target.title}" ให้แล้วค่ะ 🗑️` };
    }

    case "RESCHEDULE": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target || target.type !== "reminder") return { reply: "ไม่แน่ใจว่าจะเลื่อนอันไหนดีค่ะ ลองระบุใหม่อีกครั้งได้ไหมคะ" };
      const combined = `${params.dateText || ""} ${params.timeText || ""} ${params.rawText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      if (!parsed) return { reply: "เลื่อนไปวันไหน เวลาไหนดีคะ" };
      await reminderService.rescheduleReminder(userId, target.id, parsed.date);
      return { reply: `เลื่อน "${target.title}" ไปเป็น ${formatThaiDateTime(parsed.date)} แล้วค่ะ 📅` };
    }

    case "SNOOZE": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target || target.type !== "reminder") return { reply: "ไม่แน่ใจว่าจะเลื่อนอันไหนดีค่ะ" };
      await reminderService.snoozeReminder(userId, target.id, 60);
      return { reply: `เลื่อนแจ้งเตือน "${target.title}" ออกไป 1 ชั่วโมงแล้วค่ะ ⏰` };
    }

    case "UPDATE_TASK":
    case "UPDATE_REMINDER": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target) return { reply: "ไม่แน่ใจว่าหมายถึงรายการไหนค่ะ" };
      const combined = `${params.dateText || ""} ${params.timeText || ""}`.trim();
      const parsed = combined ? parseThaiDateTime(combined, ref) : null;
      if (target.type === "reminder") {
        await reminderService.updateReminder(userId, target.id, { title: params.title, reminderTime: parsed?.date });
      } else {
        await taskService.updateTask(userId, target.id, { title: params.title, dueDate: parsed?.date });
      }
      return { reply: `แก้ไข "${target.title}" ให้แล้วค่ะ ✏️` };
    }

    case "LIST_TODAY":
    case "DAILY_SUMMARY": {
      const data = await taskService.listToday(userId);
      return { reply: await buildDayReply(userId, "☀️ วันนี้", data) };
    }

    case "LIST_TOMORROW": {
      const data = await taskService.listTomorrow(userId);
      return { reply: await buildDayReply(userId, "🌤️ พรุ่งนี้", data) };
    }

    case "LIST_WEEK": {
      const data = await taskService.listWeek(userId);
      return { reply: await buildDayReply(userId, "📅 สัปดาห์นี้", data) };
    }

    case "LIST_PENDING": {
      const tasks = await taskService.listPending(userId);
      if (tasks.length === 0) return { reply: "ไม่มีงานค้างเลยค่ะ เก่งมาก! 🎉" };
      const lines = tasks.map((t) => `• ${t.title}${t.dueDate ? ` (${formatThaiDateTime(t.dueDate)})` : ""}`).join("\n");
      return { reply: `งานที่ยังไม่เสร็จมี ${tasks.length} รายการค่ะ\n${lines}` };
    }

    case "LIST_UPCOMING": {
      const reminders = await taskService.listUpcoming(userId);
      if (reminders.length === 0) return { reply: "ไม่มีแจ้งเตือนล่วงหน้าเลยค่ะ" };
      const lines = reminders.map((r) => `• ${formatThaiDateTime(r.reminderTime)} ${r.title}`).join("\n");
      return { reply: `รายการแจ้งเตือนที่จะถึงค่ะ\n${lines}` };
    }

    case "FINANCIAL_SUMMARY": {
      const summary = await financeService.getFinancialSummary(userId);
      const parts: string[] = [];
      if (summary.paymentsThisMonth.length > 0) {
        const lines = summary.paymentsThisMonth.map((p) => `• ${p.title} ${p.amount.toLocaleString()} บาท (${formatThaiDateTime(p.dueDate)})`).join("\n");
        parts.push(`💰 เดือนนี้ต้องจ่ายรวม ${summary.totalThisMonth.toLocaleString()} บาท\n${lines}`);
      } else {
        parts.push("💰 เดือนนี้ไม่มีรายการที่ต้องจ่ายค่ะ");
      }
      if (summary.debts.length > 0) {
        const lines = summary.debts.map((d) => `• ${d.creditor} เหลือ ${d.remainingAmount.toLocaleString()} บาท${d.dueDate ? ` (ครบกำหนด ${formatThaiDateTime(d.dueDate)})` : ""}`).join("\n");
        parts.push(`📌 หนี้คงเหลือรวม ${summary.totalDebtRemaining.toLocaleString()} บาท\n${lines}`);
      }
      return { reply: parts.join("\n\n") };
    }

    case "EVENING_SUMMARY": {
      const data = await taskService.listToday(userId);
      const completed = data.tasks.filter((t) => t.status === "COMPLETED").length;
      const pending = data.tasks.filter((t) => t.status !== "COMPLETED").length;
      const tomorrow = await taskService.listTomorrow(userId);
      const tomorrowCount = tomorrow.tasks.length + tomorrow.reminders.length + tomorrow.events.length;
      return { reply: `🌙 สรุปวันนี้\n✅ เสร็จ ${completed}\n⏳ ค้าง ${pending}\nพรุ่งนี้มี ${tomorrowCount} รายการ` };
    }

    case "GENERAL_CONVERSATION":
    default:
      return { reply: params.rawText ? "" : "รับทราบค่ะ 🐷 มีอะไรให้ช่วยเพิ่มไหมคะ" };
  }
}

/** หา entity (task/reminder) ที่กำลังพูดถึง จาก targetRef หรือถ้าไม่มีให้ใช้ตัวล่าสุด */
async function resolveTargetEntity(userId: string, targetRef?: string) {
  const lastRef = await convo.getLastEntityRef(userId);
  if (lastRef) return lastRef;
  const latestReminder = await reminderService.findLatestReminder(userId);
  if (latestReminder) return { type: "reminder" as const, id: latestReminder.id, title: latestReminder.title };
  const latestTask = await taskService.findLatestOpenTask(userId);
  if (latestTask) return { type: "task" as const, id: latestTask.id, title: latestTask.title };
  return null;
}
