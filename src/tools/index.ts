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
  paymentId?: string; // ใช้ภายในตอน slot-filling ยอดเงินของ payment ที่สร้างไว้ก่อนแล้ว (ดู FILL_PAYMENT_AMOUNT)
}

/** ดึงตัวเลขจำนวนเงินตัวแรกจากข้อความดิบ ใช้เป็น fallback เวลา AI provider ไม่ได้ parse params.amount มาให้ (กันพังกรณี provider โง่/mock) */
function extractAmountFromText(text?: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "");
  const m = cleaned.match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// คำฟุ่มเฟือยที่ไม่ควรอยู่ใน title (คำสั่ง/หมวดหมู่ ไม่ใช่ชื่อรายการจริง)
const TITLE_NOISE_WORDS = ["เตือนว่า", "เตือน", "ให้ฉัน", "ช่วย", "บันทึกว่า", "บันทึก", "การเงิน", "จดว่า", "จดไว้ว่า", "ว่า", "วันที่", "เวลา"];

/**
 * Fallback สกัด title สั้น ๆ จากประโยคดิบ เผื่อ AI provider ไม่ได้แยก title มาให้ (เช่น mock/โมเดลอ่อน)
 * ตัดวลีวันที่/เวลาที่ parseThaiDateTime จับได้แล้ว (matchedPhrases) และคำฟุ่มเฟือยทั่วไปออก
 * ตาม requirement: ห้ามเอาทั้งประโยคมาเป็น title เช่น "วันที่ 1 ตุลาคม เวลา 12:00 เตือนว่ายกเลิกคลอสโค้ด" -> "ยกเลิกคลอสโค้ด"
 */
function deriveCleanTitle(rawText: string, matchedPhrases: string[] = []): string {
  let cleaned = rawText;
  for (const phrase of matchedPhrases) {
    if (phrase) cleaned = cleaned.split(phrase).join(" ");
  }
  for (const w of TITLE_NOISE_WORDS) cleaned = cleaned.split(w).join(" ");
  return cleaned.replace(/\s+/g, " ").trim();
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
      let dueDate: Date | undefined;
      let taskParsed: ReturnType<typeof parseThaiDateTime> = null;
      if (params.dateText || params.timeText) {
        taskParsed = parseThaiDateTime(`${params.dateText || ""} ${params.timeText || ""}`, ref);
        dueDate = taskParsed?.date;
      }
      const title = params.title || deriveCleanTitle(params.rawText || "", taskParsed?.matched) || "งานใหม่";
      const task = await taskService.createTask(userId, { title, dueDate, sourceText: params.rawText });
      await convo.setLastEntityRef(userId, { type: "task", id: task.id, title: task.title });
      return { reply: dueDate ? `รับทราบค่ะ 📌 บันทึกงาน "${title}" กำหนด ${formatThaiDateTime(dueDate)} แล้วนะคะ` : `รับทราบค่ะ 📌 บันทึกงาน "${title}" ไว้แล้วนะคะ` };
    }

    case "CREATE_REMINDER":
    case "CREATE_RECURRING_REMINDER": {
      const combined = `${params.dateText || ""} ${params.timeText || ""} ${params.rawText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      const title = params.title || deriveCleanTitle(params.rawText || "", parsed?.matched) || "แจ้งเตือน";

      if (!parsed) {
        await convo.setPendingIntent(userId, "CREATE_REMINDER", { title, dateText: params.dateText || combined });
        return { reply: `ต้องการให้เตือนกี่โมง หรือวันไหนดีคะ 🐷` };
      }
      if (!parsed.hadExplicitTime && !parsed.recurrence) {
        // รู้วันที่แล้วแต่ยังไม่รู้เวลาชัดเจน -> ถามเฉพาะเวลา (ห้ามเดาเวลาเองแล้วเงียบ ๆ, ห้ามถามวันที่ซ้ำ)
        await convo.setPendingIntent(userId, "CREATE_REMINDER", { title, dateText: params.dateText || combined });
        return { reply: `เตือนกี่โมงดีคะ 🐷⏰` };
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
      // ตาม requirement: ห้ามบังคับผู้ใช้กรอกครบทุก field — ถ้ารู้แค่ชื่อ+วันที่ ก็บันทึกไปก่อนได้เลย (amount=null)
      // แล้วค่อยถามยอดทีหลังแบบสั้น ๆ (ไม่ใช่บล็อกการบันทึกทั้งรายการไว้)
      const combined = `${params.dateText || ""} ${params.timeText || ""} ${params.rawText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      const title = params.title || deriveCleanTitle(params.rawText || "", parsed?.matched) || "รายการที่ต้องจ่าย";
      if (!parsed) {
        await convo.setPendingIntent(userId, "CREATE_PAYMENT", { title, amount: params.amount ?? null });
        return { reply: `"${title}" ครบกำหนดวันไหนดีคะ 💰` };
      }

      const amount = params.amount ?? null;
      const payment = await financeService.createPayment(userId, {
        title,
        amount,
        dueDate: parsed.date,
        isRecurring: !!parsed.recurrence,
        recurrenceRule: parsed.recurrence?.type,
      });
      await convo.setLastEntityRef(userId, { type: "payment", id: payment.id, title: payment.title });

      // สร้าง reminder แจ้งเตือนวันครบกำหนดด้วยเสมอ ไม่ว่าจะรู้ยอดแล้วหรือยัง
      const reminderTitle = amount != null ? `จ่าย${title} ${amount.toLocaleString()} บาท` : `จ่าย${title}`;
      await reminderService.createReminder(userId, { title: reminderTitle, reminderTime: parsed.date, recurrence: parsed.recurrence });

      if (amount == null) {
        // ยังไม่รู้ยอด -> ถามเฉพาะยอด ครั้งเดียว ไม่ถามข้อมูลอื่นที่มีอยู่แล้วซ้ำ
        await convo.setPendingIntent(userId, "FILL_PAYMENT_AMOUNT", { paymentId: payment.id, title });
        return {
          reply: `ได้เลยค่ะ ✅ ฉันบันทึก "${title}" ไว้ให้แล้ว\nครบกำหนด ${formatThaiDateTime(payment.dueDate)}\nยังไม่ได้ระบุยอดเงิน ถ้ารู้ยอดแล้วบอกฉันได้เลยค่ะ 💰`,
        };
      }
      await convo.clearPendingIntent(userId);
      return { reply: `ได้เลยค่ะ ✅ บันทึก "${title}" ${amount.toLocaleString()} บาท ครบกำหนด ${formatThaiDateTime(payment.dueDate)} ไว้ให้แล้วนะคะ 💰` };
    }

    // ผู้ใช้เพิ่งถูกถาม "ยอดเท่าไหร่" ต่อจาก CREATE_PAYMENT ที่ยังไม่รู้ยอด — เติมยอดให้รายการเดิม ไม่สร้างรายการใหม่ซ้ำ
    case "FILL_PAYMENT_AMOUNT": {
      const paymentId = params.paymentId;
      if (!paymentId) return { reply: "ยอดเท่าไหร่ดีคะ 💰" };
      const amount = typeof params.amount === "number" ? params.amount : extractAmountFromText(params.rawText);
      if (amount == null) {
        // ยังแยกตัวเลขไม่ได้ -> ถามใหม่อีกครั้ง ไม่เดามั่ว ๆ
        await convo.setPendingIntent(userId, "FILL_PAYMENT_AMOUNT", { paymentId, title: params.title });
        return { reply: "ขอเป็นตัวเลขยอดเงินได้ไหมคะ เช่น 850 💰" };
      }
      let updated;
      try {
        updated = await financeService.updatePaymentAmount(userId, paymentId, amount);
      } catch (err: any) {
        return { reply: `ขอโทษค่ะ บันทึกยอดไม่สำเร็จ (${err?.message || "เกิดข้อผิดพลาด"}) ลองใหม่อีกครั้งได้ไหมคะ 🙏` };
      }
      await convo.clearPendingIntent(userId);
      return { reply: `บันทึกยอดให้แล้วค่ะ 💰 "${updated.title}" ${amount.toLocaleString()} บาท ครบกำหนด ${formatThaiDateTime(updated.dueDate)}` };
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
      if (!target) return { reply: "ไม่แน่ใจว่าหมายถึงรายการไหนค่ะ ลองบอกชื่ออีกครั้งได้ไหมคะ 🐷" };
      if (target.type === "reminder") await reminderService.completeReminder(userId, target.id);
      else if (target.type === "task") await taskService.completeTask(userId, target.id);
      else if (target.type === "payment") await financeService.markPaymentPaid(userId, target.id);
      else if (target.type === "debt") await financeService.markDebtPaidOff(userId, target.id);
      else return { reply: `"${target.title}" เป็นนัดหมาย ปิดงานแบบนี้ไม่ได้ค่ะ` };
      return { reply: `เยี่ยมค่ะ ✅ "${target.title}" เสร็จแล้ว!` };
    }

    case "DELETE_TASK": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target) return { reply: "ไม่แน่ใจว่าหมายถึงรายการไหนค่ะ" };
      if (target.type === "reminder") await reminderService.cancelReminder(userId, target.id);
      else if (target.type === "task") await taskService.deleteTask(userId, target.id);
      else if (target.type === "payment") await financeService.deletePayment(userId, target.id);
      else if (target.type === "debt") await financeService.deleteDebt(userId, target.id);
      else await eventService.deleteEvent(userId, target.id);
      return { reply: `ลบ "${target.title}" ให้แล้วค่ะ 🗑️` };
    }

    case "RESCHEDULE": {
      const target = await resolveTargetEntity(userId, params.targetRef);
      if (!target) return { reply: "ไม่แน่ใจว่าจะเลื่อนอันไหนดีค่ะ ลองระบุใหม่อีกครั้งได้ไหมคะ" };
      const combined = `${params.dateText || ""} ${params.timeText || ""} ${params.rawText || ""}`.trim();
      const parsed = parseThaiDateTime(combined, ref);
      if (!parsed) return { reply: "เลื่อนไปวันไหน เวลาไหนดีคะ" };
      if (target.type === "reminder") await reminderService.rescheduleReminder(userId, target.id, parsed.date);
      else if (target.type === "task") await taskService.updateTask(userId, target.id, { dueDate: parsed.date });
      else if (target.type === "payment") await financeService.updatePaymentDueDate(userId, target.id, parsed.date);
      else if (target.type === "event") await eventService.updateEvent(userId, target.id, { startTime: parsed.date });
      else return { reply: `"${target.title}" เป็นหนี้ ไม่มีวันเลื่อนแบบนี้ค่ะ` };
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
      } else if (target.type === "task") {
        await taskService.updateTask(userId, target.id, { title: params.title, dueDate: parsed?.date });
      } else if (target.type === "payment") {
        if (typeof params.amount === "number") await financeService.updatePaymentAmount(userId, target.id, params.amount);
        if (parsed?.date) await financeService.updatePaymentDueDate(userId, target.id, parsed.date);
      } else if (target.type === "event") {
        await eventService.updateEvent(userId, target.id, { title: params.title, startTime: parsed?.date });
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
        const lines = summary.paymentsThisMonth
          .map((p) => `• ${p.title} ${p.amount != null ? `${p.amount.toLocaleString()} บาท` : "(ยังไม่ระบุยอด)"} (${formatThaiDateTime(p.dueDate)})`)
          .join("\n");
        const hasUnknown = summary.paymentsThisMonth.some((p) => p.amount == null);
        parts.push(`💰 เดือนนี้ต้องจ่ายรวม ${summary.totalThisMonth.toLocaleString()} บาท${hasUnknown ? " (ไม่รวมรายการที่ยังไม่ระบุยอด)" : ""}\n${lines}`);
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

// คำอ้างอิงกำกวมที่ไม่มีความหมายเจาะจง (เช่น "อันนั้น") — ใช้แยกจากคำอ้างอิงที่มีเนื้อหาจริง (เช่น "ค่าไฟ")
const GENERIC_REF_WORDS = [
  "อันนั้น", "อันนี้", "เรื่องนั้น", "เรื่องนี้", "เมื่อกี้", "ก่อนหน้านี้", "รายการล่าสุด",
  "งานนั้น", "งานนี้", "เตือนอันเดิม", "ตัวนั้น", "ตัวนี้", "มัน", "นั้น", "นี้",
];

interface TargetCandidate {
  type: "task" | "reminder" | "payment" | "debt" | "event";
  id: string;
  title: string;
  createdAt: Date;
}

/**
 * หา entity ที่กำลังพูดถึง (task/reminder/payment/debt/event) — ไม่ใช้แค่ข้อความล่าสุดอย่างเดียว
 * ลำดับการค้นหา:
 *  1) ถ้า targetRef มีเนื้อหาเจาะจง (ไม่ใช่แค่ "อันนั้น"/"เมื่อกี้") -> ค้นหาจากชื่อรายการล่าสุดของทุกหมวดที่ตรงกับคำนั้น
 *  2) ถ้าไม่มี/เป็นคำกำกวม -> ใช้ lastEntityRef ที่จำไว้จากข้อความก่อนหน้า
 *  3) ถ้าไม่มีเลย -> ใช้รายการที่สร้าง/แก้ไขล่าสุดสุดในทุกหมวดรวมกัน
 */
async function resolveTargetEntity(userId: string, targetRef?: string) {
  const [latestReminder, latestTask, latestPayment, latestDebt, latestEvent] = await Promise.all([
    reminderService.findLatestReminder(userId),
    taskService.findLatestOpenTask(userId),
    financeService.findLatestPayment(userId),
    financeService.findLatestDebt(userId),
    eventService.findLatestEvent(userId),
  ]);

  const candidates: TargetCandidate[] = [];
  if (latestReminder) candidates.push({ type: "reminder", id: latestReminder.id, title: latestReminder.title, createdAt: latestReminder.createdAt });
  if (latestTask) candidates.push({ type: "task", id: latestTask.id, title: latestTask.title, createdAt: latestTask.createdAt });
  if (latestPayment) candidates.push({ type: "payment", id: latestPayment.id, title: latestPayment.title, createdAt: latestPayment.createdAt });
  if (latestDebt) candidates.push({ type: "debt", id: latestDebt.id, title: latestDebt.creditor, createdAt: latestDebt.createdAt });
  if (latestEvent) candidates.push({ type: "event", id: latestEvent.id, title: latestEvent.title, createdAt: latestEvent.createdAt });

  const ref = (targetRef || "").trim();
  const isGeneric = ref.length === 0 || GENERIC_REF_WORDS.includes(ref);
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

  if (!isGeneric) {
    const refN = normalize(ref);
    const matches = candidates
      .filter((c) => {
        const titleN = normalize(c.title);
        return titleN.includes(refN) || refN.includes(titleN);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (matches.length > 0) return matches[0];
  }

  // ไม่มีคำอ้างอิงเจาะจง หรือหาไม่เจอ -> ใช้ตัวที่จำไว้จากการสนทนาก่อนหน้า
  const lastRef = await convo.getLastEntityRef(userId);
  if (lastRef) return lastRef;

  // สุดท้าย: ใช้รายการล่าสุดสุดจากทุกหมวดรวมกัน
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return candidates[0] || null;
}
