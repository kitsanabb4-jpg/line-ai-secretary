import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import { getSTTProvider } from "../src/speech";
import { handleUserMessage } from "../src/ai/intent";
import { prisma } from "../src/database/client";

/**
 * ทดสอบ voice pipeline แบบ end-to-end (โหมด DEMO_MODE ใช้ mock ทั้งหมด):
 * LINE Voice(mock buffer) -> Download(mock) -> STT(mock) -> Thai text -> AI(mock) -> Intent -> Tool -> Database
 */
describe("Voice processing pipeline (DEMO_MODE)", () => {
  it("แปลงเสียง (mock) เป็นข้อความไทย แล้วสร้าง reminder ในฐานข้อมูลได้จริง", async () => {
    const user = await createTestUser("voice-pipeline");
    const stt = getSTTProvider();

    const fakeAudioBuffer = Buffer.from("");
    const transcribedText = await stt.transcribe(fakeAudioBuffer, "m4a");
    expect(transcribedText).toContain("เตือน");

    const reply = await handleUserMessage(user.id, transcribedText);
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);

    const reminder = await prisma.reminder.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(reminder).not.toBeNull();
  });

  it("ข้อความ IN ที่มาจากเสียงถูกบันทึกลงตาราง Message", async () => {
    const user = await createTestUser("voice-pipeline-log");
    await handleUserMessage(user.id, "พรุ่งนี้สิบโมงเตือนฉันไปส่งเอกสาร");
    const msg = await prisma.message.findFirst({ where: { userId: user.id, direction: "IN" } });
    expect(msg).not.toBeNull();
    expect(msg?.intent).toBe("CREATE_REMINDER");
  });
});
