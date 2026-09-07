import { z } from "zod";

// Schema สำหรับ validate ผลลัพธ์ intent ที่ AI ส่งกลับมา (กัน hallucination/รูปแบบผิด)
export const IntentResultSchema = z.object({
  intent: z.string(),
  reply: z.string().default(""),
  needsClarification: z.boolean().default(false),
  clarifyingQuestion: z.string().optional().nullable(),
  params: z.record(z.any()).default({}),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

export function safeParseIntentJson(raw: string): IntentResult | null {
  try {
    // AI บางทีตอบมาเป็น ```json ... ``` ต้อง strip ออกก่อน
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    const result = IntentResultSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function isValidLineUserId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && id.length < 100;
}
