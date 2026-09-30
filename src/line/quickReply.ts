// Helper สร้างปุ่ม Quick Reply / ปุ่มใน template message สำหรับ LINE
import { env } from "../config/env";

export function reminderActionButtons(reminderId: string) {
  return {
    type: "template",
    altText: "ตัวเลือกการแจ้งเตือน",
    template: {
      type: "buttons",
      text: "จะจัดการยังไงดีคะ 🐷",
      actions: [
        { type: "postback", label: "✅ เสร็จแล้ว", data: `action=complete_reminder&id=${reminderId}` },
        { type: "postback", label: "⏰ เลื่อน 1 ชั่วโมง", data: `action=snooze_reminder&id=${reminderId}&minutes=60` },
        { type: "postback", label: "📅 พรุ่งนี้", data: `action=reschedule_tomorrow&id=${reminderId}` },
      ],
    },
  };
}

/** userId (ไม่บังคับ): ถ้าใส่มาและตั้งค่า PUBLIC_BASE_URL ไว้ จะแถมปุ่มลิงก์เปิด Planner Dashboard ให้ด้วย */
export function mainMenuQuickReply(userId?: string) {
  const items: any[] = [
    { type: "action", action: { type: "message", label: "🏠 วันนี้", text: "วันนี้ฉันมีอะไร" } },
    { type: "action", action: { type: "message", label: "📅 สัปดาห์นี้", text: "สัปดาห์นี้ฉันมีอะไร" } },
    { type: "action", action: { type: "message", label: "🗓️ เดือนนี้", text: "เดือนนี้ฉันมีอะไรบ้าง" } },
    { type: "action", action: { type: "message", label: "✅ งาน", text: "งานที่ค้างอยู่มีอะไรบ้าง" } },
    { type: "action", action: { type: "message", label: "💰 การเงิน", text: "เดือนนี้ต้องจ่ายอะไรบ้าง" } },
    { type: "action", action: { type: "message", label: "🧠 ความจำ", text: "ค้นความจำ" } },
  ];
  if (userId && env.PUBLIC_BASE_URL) {
    items.push({ type: "action", action: { type: "uri", label: "🖥️ เปิด Planner", uri: `${env.PUBLIC_BASE_URL}/planner/${userId}` } });
  }
  return { items };
}
