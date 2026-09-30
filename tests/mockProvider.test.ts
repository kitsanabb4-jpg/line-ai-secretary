import { describe, it, expect } from "vitest";
import { MockAIProvider } from "../src/ai/providers/mock";

/**
 * Mock AI provider เป็น "สมอง" จริงของบอทใน production (AI_PROVIDER=mock)
 * เทสต์นี้ป้องกัน regression ของปัญหา "บันทึกงานไม่ค่อยเก่ง" — ประโยคที่คนพูดจริงเวลาจะบันทึกงาน
 * (ไม่มีคำว่า "สร้าง"/"เพิ่ม" ตรง ๆ) ต้องถูกจับเป็น CREATE_TASK ไม่ใช่ตกไปที่ GENERAL_CONVERSATION
 */
async function classify(text: string): Promise<string> {
  const provider = new MockAIProvider();
  const raw = await provider.chat([{ role: "user", content: text }]);
  return JSON.parse(raw).intent;
}

describe("MockAIProvider — จับ intent การบันทึกงาน (CREATE_TASK) จากประโยคพูดธรรมชาติ", () => {
  it.each([
    "จดงานส่งรายงานพรุ่งนี้",
    "บันทึกงานประชุมทีมวันศุกร์",
    "พรุ่งนี้ต้องส่งเอกสาร",
    "ต้องเตรียมของสำหรับงานเลี้ยง",
    "มีงานส่งการบ้านวันจันทร์",
    "จดว่าต้องซื้อของเข้าบ้าน",
  ])("'%s' -> CREATE_TASK", async (text) => {
    expect(await classify(text)).toBe("CREATE_TASK");
  });

  it("ไม่ชนกับ CREATE_REMINDER เมื่อมีคำว่า 'เตือน' อยู่ด้วย", async () => {
    expect(await classify("พรุ่งนี้เตือนส่งเอกสาร")).toBe("CREATE_REMINDER");
  });

  it("ไม่ชนกับ CREATE_PAYMENT เมื่อพูดถึงเรื่องเงิน/บิล", async () => {
    expect(await classify("ต้องจ่ายค่าไฟวันที่ 15")).toBe("CREATE_PAYMENT");
  });

  it("ไม่ชนกับ SAVE_MEMORY เมื่อพูดแบบ 'จำไว้ว่า'/'บันทึกไว้ว่า' ชัดเจน", async () => {
    expect(await classify("จำไว้ว่าแฟนชอบสีฟ้า")).toBe("SAVE_MEMORY");
    expect(await classify("บันทึกไว้ว่าบ้านอยู่ซอย 5")).toBe("SAVE_MEMORY");
  });

  it("คำตอบสั้น ๆ ระหว่าง slot-filling (เช่นเวลา/ยอดเงิน) ต้องไม่ถูกเดาเป็น CREATE_TASK", async () => {
    expect(await classify("สิบโมง")).toBe("GENERAL_CONVERSATION");
    expect(await classify("500")).toBe("GENERAL_CONVERSATION");
  });
});

describe("MockAIProvider — จับ intent ตาราง รายวัน/สัปดาห์/เดือน", () => {
  it("'เดือนนี้มีอะไรบ้าง' -> LIST_MONTH", async () => {
    expect(await classify("เดือนนี้มีอะไรบ้าง")).toBe("LIST_MONTH");
  });
  it("'สรุปเดือนนี้ให้หน่อย' -> LIST_MONTH", async () => {
    expect(await classify("สรุปเดือนนี้ให้หน่อย")).toBe("LIST_MONTH");
  });
  it("'สัปดาห์นี้มีอะไรบ้าง' -> LIST_WEEK", async () => {
    expect(await classify("สัปดาห์นี้มีอะไรบ้าง")).toBe("LIST_WEEK");
  });
  it("'วันนี้มีนัดอะไรบ้าง' -> LIST_TODAY", async () => {
    expect(await classify("วันนี้มีนัดอะไรบ้าง")).toBe("LIST_TODAY");
  });
});
