import { getDueNotifications, markNotificationSent, markNotificationFailed } from "./notificationService";
import { pushMessage, textMessage } from "../line/client";
import { reminderActionButtons } from "../line/quickReply";
import { rollForwardRecurringReminder } from "../reminders/reminderService";
import { prisma } from "../database/client";
import { logger } from "../utils/logger";
import { nowInTz, dayjs } from "../utils/timezone";
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

  const escalation = await runEscalationCheck(now);

  // ตรวจ reminder ที่เลย reminderTime ไปนานแล้วแต่ยังไม่มี notification (กันกรณี edge case) -> ทำเครื่องหมาย MISSED
  const staleThreshold = nowInTz().subtract(1, "day").toDate();
  await prisma.reminder.updateMany({
    where: { status: "PENDING", reminderTime: { lt: staleThreshold } },
    data: { status: "MISSED" },
  });

  return { processed: due.length, escalated: escalation.escalated };
}

/**
 * เตือนซ้ำอัตโนมัติ — ถ้า reminder ถูกส่งแจ้งเตือนไปแล้วครั้งแรก แต่ผู้ใช้ไม่ตอบสนองเลย
 * (ไม่กดเสร็จแล้ว/เลื่อน/ยกเลิก สถานะยังเป็น PENDING) ภายใน 60 นาที ให้เตือนซ้ำอีกครั้งเดียว
 * (ไม่เตือนซ้ำไปเรื่อย ๆ เพื่อไม่ให้กวนใจเกินไป — ถ้ายังไม่ตอบอีกจะปล่อยให้ stale-check ด้านบน
 * ทำเครื่องหมาย MISSED ไปเองหลัง 1 วัน)
 */
async function runEscalationCheck(now: Date) {
  const threshold = dayjs(now).subtract(60, "minute").toDate();

  // หมายเหตุ: จงใจไม่กรองด้วย reminder.reminderTime ที่ระดับ DB query เพราะ reminderTime ของ recurring
  // reminder จะถูก roll forward ไปอนาคตทันทีตอนแจ้งเตือนครั้งแรก (ไม่ตรงกับเวลาที่ "ส่งจริง" อีกต่อไป)
  // ใช้ notification.sentAt (เวลาที่ส่งจริง) เป็นตัวตัดสินแทน ถึงจะแม่นยำกว่าเสมอ
  const candidates = await prisma.reminder.findMany({
    where: { status: "PENDING" },
    include: { notifications: { where: { status: "SENT" } }, user: true },
  });

  let escalated = 0;
  for (const reminder of candidates) {
    // ต้องมีการแจ้งเตือนที่ส่งสำเร็จไปแล้ว "ครั้งเดียว" เท่านั้น (ครั้งแรก) ถ้าเคยเตือนซ้ำไปแล้วก็ไม่เตือนซ้ำอีก
    if (reminder.notifications.length !== 1) continue;
    const firstSentAt = reminder.notifications[0].sentAt;
    // ยังไม่เคยส่งจริง (sentAt ว่าง) หรือส่งไปยังไม่ถึง 60 นาที -> ยังไม่ต้องเตือนซ้ำ
    if (!firstSentAt || firstSentAt > threshold) continue;

    try {
      const message = `⏰ ยังไม่ได้ตอบรับเรื่อง "${reminder.title}" เลยนะคะ ยังต้องการให้เตือนอยู่ไหมคะ?`;
      await pushMessage(reminder.user.lineUserId, [textMessage(message), reminderActionButtons(reminder.id)]);
      await prisma.notification.create({
        data: {
          userId: reminder.userId,
          reminderId: reminder.id,
          message,
          scheduledAt: now,
          sentAt: now,
          status: "SENT",
        },
      });
      escalated++;
    } catch (err) {
      logger.error(`Failed to send escalation reminder for ${reminder.id}`, err);
    }
  }

  if (escalated > 0) logger.info(`Scheduler tick: ${escalated} escalation reminder(s) sent`);
  return { escalated };
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
