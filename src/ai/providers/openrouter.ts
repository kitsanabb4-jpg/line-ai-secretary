import axios from "axios";
import { AIProvider, ChatMessage } from "../provider";
import { env } from "../../config/env";

/** OpenRouter provider (https://openrouter.ai/keys) — มีหลาย model ฟรี (ลงท้ายด้วย ":free") */
export class OpenRouterProvider implements AIProvider {
  name = "openrouter";

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ AI Provider");
    }
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      { model: env.OPENROUTER_MODEL, messages, temperature: 0.3 },
      { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenRouter ไม่ได้ตอบข้อความกลับมา");
    return text;
  }
}
