// Helper สร้างปุ่ม Quick Reply / ปุ่มใน template message สำหรับ LINE

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

export function mainMenuQuickReply() {
  return {
    items: [
      { type: "action", action: { type: "message", label: "🏠 วันนี้", text: "วันนี้ฉันมีอะไร" } },
      { type: "action", action: { type: "message", label: "📅 ตาราง", text: "สัปดาห์นี้ฉันมีอะไร" } },
      { type: "action", action: { type: "message", label: "✅ งาน", text: "งานที่ค้างอยู่มีอะไรบ้าง" } },
      { type: "action", action: { type: "message", label: "💰 การเงิน", text: "เดือนนี้ต้องจ่ายอะไรบ้าง" } },
      { type: "action", action: { type: "message", label: "🧠 ความจำ", text: "ค้นความจำ" } },
    ],
  };
}
