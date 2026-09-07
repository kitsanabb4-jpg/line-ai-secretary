import axios from "axios";
import { AIProvider, ChatMessage } from "../provider";
import { env } from "../../config/env";

/**
 * Google Gemini provider (ฟรีที่ https://aistudio.google.com/app/apikey)
 * free tier ค่อนข้างใจกว้างและรองรับภาษาไทยดี จึงเป็นค่าแนะนำอันดับแรก
 */
export class GeminiProvider implements AIProvider {
  name = "gemini";

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ AI Provider");
    }
    const system = messages.find((m) => m.role === "system")?.content || "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await axios.post(url, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini ไม่ได้ตอบข้อความกลับมา");
    return text;
  }
}
