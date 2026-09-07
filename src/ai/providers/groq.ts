import axios from "axios";
import { AIProvider, ChatMessage } from "../provider";
import { env } from "../../config/env";

/**
 * Groq provider (ฟรีที่ https://console.groq.com/keys) — ใช้ OpenAI-compatible chat completions API
 * เร็วมาก (LPU inference) และ free tier ใจกว้าง เหมาะเป็นทางเลือกแรก ๆ เช่นกัน
 */
export class GroqProvider implements AIProvider {
  name = "groq";

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ AI Provider");
    }
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: env.GROQ_MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      },
      { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq ไม่ได้ตอบข้อความกลับมา");
    return text;
  }
}
