import axios from "axios";
import FormData from "form-data";
import { STTProvider } from "../provider";
import { env } from "../../config/env";

/** OpenAI Whisper provider — มีค่าใช้จ่าย ใช้เป็นทางเลือกเสริม */
export class OpenAIWhisperProvider implements STTProvider {
  name = "openai_whisper";

  async transcribe(audio: Buffer, fileExt = "m4a"): Promise<string> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY ยังไม่ได้ตั้งค่า — ดู SETUP.md หัวข้อ Speech-to-Text");
    }
    const form = new FormData();
    form.append("file", audio, { filename: `audio.${fileExt}` });
    form.append("model", env.STT_OPENAI_MODEL);
    form.append("language", "th");

    const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      maxBodyLength: Infinity,
    });
    return res.data?.text || "";
  }
}
