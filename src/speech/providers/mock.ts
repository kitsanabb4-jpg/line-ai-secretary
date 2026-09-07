import { STTProvider } from "../provider";

/**
 * Mock STT provider — ใช้ตอน DEMO_MODE หรือยังไม่ได้ตั้งค่า STT provider จริง
 * คืนประโยคตัวอย่างคงที่ เพื่อให้ทดสอบ pipeline เสียง -> ข้อความ -> AI -> DB ได้แบบ end-to-end
 * โดยไม่ต้องมีไฟล์เสียงจริง (ใช้กับ npm run demo)
 */
export class MockSTTProvider implements STTProvider {
  name = "mock";

  async transcribe(_audio: Buffer): Promise<string> {
    return "พรุ่งนี้สิบโมงเตือนฉันไปส่งเอกสาร";
  }
}
