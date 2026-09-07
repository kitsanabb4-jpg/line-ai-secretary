import axios from "axios";
import { AIProvider, ChatMessage } from "../provider";
import { env } from "../../config/env";

/** OpenAI provider — มีค่าใช้จ่าย ใช้เป็นทางเลือกเสริมเท่านั้น (ไม่ใช่ค่าเริ่มต้นตาม FREE-FIRST policy) */
export class OpenAIProvider implements AIProvider {
  name = "openai";

  async chat(messages: ChatMessage[]): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ AI Provider");
    }
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: env.OPENAI_MODEL, messages, temperature: 0.3, response_format: { type: "json_object" } },
      { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI ไม่ได้ตอบข้อความกลับมา");
    return text;
  }
}
