import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

const CHANNEL_SECRET = "test-channel-secret";

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

describe("LINE webhook signature verification", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEMO_MODE = "false";
    process.env.LINE_CHANNEL_SECRET = CHANNEL_SECRET;
  });

  it("ยอมรับลายเซ็นที่ถูกต้อง", async () => {
    const { verifyLineSignature } = await import("../src/line/signature");
    const body = JSON.stringify({ events: [] });
    const signature = sign(body, CHANNEL_SECRET);
    expect(verifyLineSignature(body, signature)).toBe(true);
  });

  it("ปฏิเสธลายเซ็นที่ผิด", async () => {
    const { verifyLineSignature } = await import("../src/line/signature");
    const body = JSON.stringify({ events: [] });
    expect(verifyLineSignature(body, "invalid-signature==")).toBe(false);
  });

  it("ปฏิเสธเมื่อไม่มี signature header เลย", async () => {
    const { verifyLineSignature } = await import("../src/line/signature");
    const body = JSON.stringify({ events: [] });
    expect(verifyLineSignature(body, undefined)).toBe(false);
  });

  it("ปฏิเสธเมื่อ body ถูกแก้ไข (แม้ signature จะถูกของ body เดิม)", async () => {
    const { verifyLineSignature } = await import("../src/line/signature");
    const originalBody = JSON.stringify({ events: [] });
    const tamperedBody = JSON.stringify({ events: [{ malicious: true }] });
    const signature = sign(originalBody, CHANNEL_SECRET);
    expect(verifyLineSignature(tamperedBody, signature)).toBe(false);
  });

  it("DEMO_MODE=true ข้ามการตรวจสอบลายเซ็นเสมอ (สำหรับทดสอบโดยไม่มี LINE จริง)", async () => {
    vi.resetModules();
    process.env.DEMO_MODE = "true";
    const { verifyLineSignature } = await import("../src/line/signature");
    expect(verifyLineSignature("{}", undefined)).toBe(true);
  });
});
