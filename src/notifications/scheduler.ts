import { getDueNotifications, markNotificationSent, markNotificationFailed } from "./notificationService";
import { pushMessage, textMessage } from "../line/client";
import { reminderActionButtons } from "../line/quickReply";
import { rollForwardRecurringReminder } from "../reminders/reminderService";
import { prisma } from "../database/client";
import { logger } from "../utils/logger";
import { nowInTz } from "../utils/timezone";
import { listAllUsers } from "../users/userService";
import { executeIntent } from "../tools/index";

/**
 * Scheduler tick — เรียกเป็นระยะโดย cron ภายนอก (ฟรี เช่น cron-job.org) ทุก 1 นาที
 * ทำงานแยกขาดจาก AI/conversation โดยสิ้นเชิง ตาม REMINDER ENGINE requirement:
 * "Reminder ต้องทำงานแม้ AI ไม่ได้กำลังสนทนา"
 */
export async function runSchedulerTick() {
  const now = new Date();
  const due = await getDueNotifications(now);
  logger.info(`Scheduler tick: ${due.length} notification(s) due`);

  for (const notif of due) {
    try {
      const reminder = notif.reminder;
      const message: any[] = [textMessage(`🔔 ${notif.message}`)];
      if (reminder) {
        message.push(reminderActionButtons(reminder.id));
      }
      await pushMessage(notif.user.lineUserId, message);
      await markNotificationSent(notif.id);

      // ถ้าเป็น reminder ที่ไม่ซ้ำ (ONE_TIME) และยังไม่ถูกกดปุ่มใด ๆ ให้เปลี่ยนสถานะเป็น PENDING (รอ user ตอบสนอง)
      // ถ้าเป็นแบบ recurring (DAILY/WEEKLY/MONTHLY/YEARLY) ให้คำนวณรอบถัดไปทันทีเพื่อ queue การแจ้งเตือนครั้งต่อไป
      if (reminder && reminder.type !== "ONE_TIME") {
        await rollForwardRecurringReminder(reminder.id);
      }
    } catch (err) {
      logger.error(`Failed to send notification ${notif.id}`, err);
      await markNotificationFailed(notif.id).catch(() => {});
    }
  }

  // ตรวจ reminder ที่เลย reminderTime ไปนานแล้วแต่ยังไม่มี notification (กันกรณี edge case) -> ทำเครื่องหมาย MISSED
  const staleThreshold = nowInTz().subtract(1, "day").toDate();
  await prisma.reminder.updateMany({
    where: { status: "PENDING", reminderTime: { lt: staleThreshold } },
    data: { status: "MISSED" },
  });

  return { processed: due.length };
}

/** ส่ง daily briefing ให้ user ที่เปิดใช้งานไว้ (เรียกจาก scheduler tick เมื่อถึงเวลาที่ตั้งไว้) */
export async function runDailyBriefings() {
  const users = await listAllUsers();
  const nowStr = nowInTz().format("HH:mm");
  let sent = 0;
  for (const user of users) {
    if (user.preferences?.dailyBriefingEnabled && user.preferences.dailyBriefingTime === nowStr) {
      const result = await executeIntent(user.id, "DAILY_SUMMARY", {});
      await pushMessage(user.lineUserId, [textMessage(result.reply)]);
      sent++;
    }
    if (user.preferences?.eveningSummaryEnabled && user.preferences.eveningSummaryTime === nowStr) {
      const result = await executeIntent(user.id, "EVENING_SUMMARY", {});
      await pushMessage(user.lineUserId, [textMessage(result.reply)]);
      sent++;
    }
  }
  return { sent };
}
