import axios from "axios";
import FormData from "form-data";
import { STTProvider } from "../provider";
import { env } from "../../config/env";

/**
 * Groq Whisper provider (ฟรีที่ https://console.groq.com/keys)
 * ใช้ whisper-large-v3 ผ่าน Groq — เร็วและฟรี รองรับภาษาไทยได้ดี แนะนำเป็นค่าเริ่มต้น
 */
export class GroqWhisperProvider implements STTProvider {
  name = "groq_whisper";

  async transcribe(audio: Buffer, fileExt = "m4a"): Promise<string> {
    if (!env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ Speech-to-Text");
    }
    const form = new FormData();
    form.append("file", audio, { filename: `audio.${fileExt}` });
    form.append("model", env.STT_GROQ_MODEL);
    form.append("language", "th");

    const res = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${env.GROQ_API_KEY}` },
      maxBodyLength: Infinity,
    });
    return res.data?.text || "";
  }
}
