import { AIProvider, ChatMessage } from "../provider";

/**
 * Mock AI provider — ใช้ตอน DEMO_MODE หรือยังไม่มี API key ของ AI จริง
 * ทำ intent parsing แบบ rule-based ง่าย ๆ พอให้ทดสอบ flow ทั้งระบบได้ (create/list/complete ฯลฯ)
 * ไม่ฉลาดเท่า LLM จริง แต่ครอบคลุมคำสั่งตัวอย่างใน SETUP.md
 *
 * หมายเหตุสำคัญ (แก้ปัญหา "บันทึกงานไม่ค่อยเก่ง"):
 * ตอนนี้ production ยังใช้ provider ตัวนี้อยู่ (AI_PROVIDER=mock) ดังนั้นความแม่นของ regex ที่นี่
 * = ความแม่นของบอทจริงที่ user คุยด้วย เดิมทีเงื่อนไข CREATE_TASK แคบมาก
 * (ต้องมีคำว่า "งาน"/"task" คู่กับ "สร้าง"/"เพิ่ม" เท่านั้น) ทำให้ประโยคทั่วไปที่คนพูดจริง เช่น
 * "จดงานส่งรายงานพรุ่งนี้", "บันทึกงานประชุมทีม", "พรุ่งนี้ต้องส่งเอกสาร" ไม่ถูกจับเป็น CREATE_TASK เลย
 * แล้วตกไปที่ GENERAL_CONVERSATION ซึ่งไม่บันทึกอะไรลงฐานข้อมูล -> user รู้สึกว่า "บันทึกงานไม่ได้"
 * จึงขยาย isLikelyTask() ให้ครอบคลุมคำพูดจริงมากขึ้น (ดูฟังก์ชันด้านล่าง)
 *
 * จงใจ "ไม่" ใส่ fallback แบบกว้าง ๆ ที่จับทุกประโยคบอกเล่าที่เหลือให้กลายเป็น CREATE_TASK เพราะ mock
 * provider นี้ไม่รู้บริบทว่ามี pendingIntent ค้างอยู่หรือไม่ (ดู src/ai/intent.ts ที่ merge ผลลัพธ์กับ
 * pendingIntent เฉพาะตอน intent="GENERAL_CONVERSATION" เท่านั้น) — ถ้าคำตอบสั้น ๆ ระหว่าง slot-filling
 * เช่น "สิบโมง", "500" ถูกเดาเป็น CREATE_TASK ไปเอง จะไปแทนที่ pendingIntent เดิมและสร้างรายการซ้อนผิด
 * โดยไม่ได้ตั้งใจ จึงปล่อยข้อความที่ไม่เข้าเงื่อนไขชัดเจนใด ๆ ให้ตกไปที่ GENERAL_CONVERSATION ตามเดิม
 * แล้วให้ pendingIntent merge ทำงานตามปกติ
 */
export class MockAIProvider implements AIProvider {
  name = "mock";

  async chat(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUser?.content || "").trim();

    let intent = "GENERAL_CONVERSATION";

    // เปิด Planner Dashboard — เช็คก่อนเงื่อนไขอื่น ๆ เพราะผู้ใช้อาจพิมพ์ "เปิด Planner" ตรง ๆ
    // (ปุ่ม quick-reply ก็ลิงก์ไปหน้านี้เหมือนกัน แต่บางอุปกรณ์/บาง LINE client อาจไม่แสดงปุ่ม
    // จึงต้องมีทางเข้าแบบพิมพ์คำสั่งตรง ๆ ด้วยเสมอ เป็น fallback ที่ทำงานได้ 100% ไม่พึ่งพา UI ของ LINE)
    if (/แพลนเนอร์|planner|เปิดตาราง|ดูตาราง|เปิดปฏิทิน|เปิดหน้าเว็บ|dashboard/i.test(text)) intent = "OPEN_PLANNER";
    else if (/(วันนี้).*(มีอะไร|นัด|งาน)/.test(text) || text.includes("สรุปวันนี้")) intent = "LIST_TODAY";
    else if (/(พรุ่งนี้).*(มีอะไร)/.test(text)) intent = "LIST_TOMORROW";
    else if (/(สัปดาห์นี้|อาทิตย์นี้).*(มีอะไร|สรุป)|สรุปสัปดาห์/.test(text)) intent = "LIST_WEEK";
    else if (/(เดือนนี้|เดือนหน้า).*(มีอะไร|สรุป)|สรุปเดือน|ตารางเดือน/.test(text)) intent = "LIST_MONTH";
    else if (/ค้าง|ยังไม่เสร็จ/.test(text)) intent = "LIST_PENDING";
    else if (/จำไว้ว่า|บันทึกไว้ว่า/.test(text)) intent = "SAVE_MEMORY";
    else if (/(เมื่อกี้|ก่อนหน้านี้).*(บอก|พูด)/.test(text)) intent = "SEARCH_MEMORY";
    else if (/ลืม.*ที่จำ|ลบความจำ/.test(text)) intent = "FORGET_MEMORY";
    else if (/เลื่อน/.test(text)) intent = "RESCHEDULE";
    else if (/แก้เป็น|เปลี่ยนเป็น|แก้ไขเป็น/.test(text)) intent = "UPDATE_TASK";
    else if (/เสร็จแล้ว|ทำเสร็จ/.test(text)) intent = "COMPLETE_TASK";
    // "ลบ"/"ลบถาวร" = ขอลบถาวร (executeIntent จะถามยืนยันก่อนลบจริงเสมอสำหรับงาน/นัดหมาย — ดู DELETE_TASK ใน tools/index.ts)
    else if (/ลบ/.test(text)) intent = "DELETE_TASK";
    // "ยกเลิก" = cancel แบบเก็บประวัติไว้ (ไม่เท่ากับลบถาวร) ทำทันทีไม่ต้องถามยืนยัน
    else if (/ยกเลิก/.test(text)) intent = "CANCEL_ITEM";
    else if (/ต้องจ่ายอะไรบ้าง|จ่ายอะไรบ้าง|มีหนี้อะไร/.test(text)) intent = "FINANCIAL_SUMMARY";
    else if (/หนี้/.test(text) && /(ยืม|กู้|เป็นหนี้)/.test(text)) intent = "CREATE_DEBT";
    else if (/หนี้/.test(text)) intent = "FINANCIAL_SUMMARY";
    // รายรับ-รายจ่ายพื้นฐาน (สมุดบันทึกส่วนตัว) ต้องเช็คก่อน CREATE_PAYMENT เสมอ เพราะเป็นอดีต ("จ่ายไปแล้ว")
    // ต่างจาก CREATE_PAYMENT ที่เป็นบิลอนาคต ("ต้องจ่าย")
    else if (/สรุปรายรับรายจ่าย|รายรับรายจ่ายเดือนนี้|ดูรายจ่าย|ดูรายรับ/.test(text)) intent = "SHOW_FINANCE_RECORDS";
    else if (/(ได้เงิน|เงินเดือนออก|รายได้เข้า|ได้รับเงิน)/.test(text)) intent = "ADD_INCOME";
    else if (/(จ่าย|เสียเงิน|ซื้อ).*ไป.*บาท|จ่ายไปแล้ว/.test(text)) intent = "ADD_EXPENSE";
    else if (/การเงิน|ต้องจ่าย|ค่าใช้จ่าย|บิล/.test(text)) intent = "CREATE_PAYMENT";
    else if (/เตือน/.test(text)) intent = "CREATE_REMINDER";
    else if (isLikelyTask(text)) intent = "CREATE_TASK";

    return JSON.stringify({
      intent,
      reply: "",
      needsClarification: false,
      clarifyingQuestion: null,
      params: { rawText: text },
    });
  }
}

/** คำพูดที่บ่งชัดว่าเป็นการจด/บันทึกงานหรือสิ่งที่ต้องทำ (ไม่จำเป็นต้องมีคำว่า "สร้าง"/"เพิ่ม" แบบเดิม) */
function isLikelyTask(text: string): boolean {
  if (/task|todo/i.test(text)) return true;
  // "งาน" ร่วมกับคำกริยาการบันทึก/ระบุความมีอยู่ทั่วไป (ไม่บังคับต้องเป็น "สร้าง"/"เพิ่ม" เท่านั้นเหมือนเดิม)
  if (/งาน/.test(text) && /สร้าง|เพิ่ม|จด|บันทึก|มี/.test(text)) return true;
  // "ต้อง" + กริยาที่มักใช้พูดถึงสิ่งที่ต้องทำ เช่น "พรุ่งนี้ต้องส่งเอกสาร", "ต้องเตรียมของ"
  // (กันชนกับ CREATE_PAYMENT ที่มีคำว่า "ต้องจ่าย" อยู่แล้วด้วยเงื่อนไข exclude ท้ายนี้)
  if (/ต้อง(ทำ|ส่ง|เตรียม|จัดการ|ไป|เช็ค|ตรวจ|โทร|ติดต่อ|นัด)/.test(text)) return true;
  // จด/บันทึกทั่วไปแบบไม่ใช่ SAVE_MEMORY (ซึ่งต้องมี "...ไว้ว่า" ชัดเจน) — ถือเป็นงานที่ต้องติดตาม
  if (/^(จด|บันทึก)(?!ไว้ว่า)/.test(text)) return true;
  return false;
}
