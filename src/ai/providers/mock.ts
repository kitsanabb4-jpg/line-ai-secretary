import { AIProvider, ChatMessage } from "../provider";

/**
 * Mock AI provider — ใช้ตอน DEMO_MODE หรือยังไม่มี API key ของ AI จริง
 * ทำ intent parsing แบบ rule-based ง่าย ๆ พอให้ทดสอบ flow ทั้งระบบได้ (create/list/complete ฯลฯ)
 * ไม่ฉลาดเท่า LLM จริง แต่ครอบคลุมคำสั่งตัวอย่างใน SETUP.md
 */
export class MockAIProvider implements AIProvider {
  name = "mock";

  async chat(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUser?.content || "").trim();

    // รูปแบบ intent อย่างง่าย: ถ้าข้อความมีคำว่า "เตือน" -> CREATE_REMINDER
    // ถ้ามี "วันนี้" + "อะไร" -> LIST_TODAY, ฯลฯ
    // การ parse วันเวลาจริง ๆ ทำที่ nlu/thaiDate.ts แล้วส่งผลมาที่ params.rawText ให้ intent layer ไป parse ต่อ
    let intent = "GENERAL_CONVERSATION";
    if (/(วันนี้).*(มีอะไร|นัด|งาน)/.test(text) || text.includes("สรุปวันนี้")) intent = "LIST_TODAY";
    else if (/(พรุ่งนี้).*(มีอะไร)/.test(text)) intent = "LIST_TOMORROW";
    else if (/(สัปดาห์นี้|อาทิตย์นี้).*(มีอะไร)/.test(text)) intent = "LIST_WEEK";
    else if (/ค้าง|ยังไม่เสร็จ/.test(text)) intent = "LIST_PENDING";
    else if (/จำไว้ว่า|บันทึกไว้ว่า/.test(text)) intent = "SAVE_MEMORY";
    else if (/(เมื่อกี้|ก่อนหน้านี้).*(บอก|พูด)/.test(text)) intent = "SEARCH_MEMORY";
    else if (/ลืม.*ที่จำ|ลบความจำ/.test(text)) intent = "FORGET_MEMORY";
    else if (/เลื่อน/.test(text)) intent = "RESCHEDULE";
    else if (/แก้เป็น|เปลี่ยนเป็น|แก้ไขเป็น/.test(text)) intent = "UPDATE_TASK";
    else if (/เสร็จแล้ว|ทำเสร็จ/.test(text)) intent = "COMPLETE_TASK";
    else if (/ต้องจ่ายอะไรบ้าง|จ่ายอะไรบ้าง|มีหนี้อะไร/.test(text)) intent = "FINANCIAL_SUMMARY";
    else if (/หนี้/.test(text) && /(ยืม|กู้|เป็นหนี้)/.test(text)) intent = "CREATE_DEBT";
    else if (/หนี้/.test(text)) intent = "FINANCIAL_SUMMARY";
    else if (/การเงิน|ต้องจ่าย|ค่าใช้จ่าย|บิล/.test(text)) intent = "CREATE_PAYMENT";
    else if (/เตือน/.test(text)) intent = "CREATE_REMINDER";
    else if (/task|งาน/.test(text) && /สร้าง|เพิ่ม/.test(text)) intent = "CREATE_TASK";

    return JSON.stringify({
      intent,
      reply: "",
      needsClarification: false,
      clarifyingQuestion: null,
      params: { rawText: text },
    });
  }
}
