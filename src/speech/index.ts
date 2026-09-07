import { STTProvider } from "./provider";
import { MockSTTProvider } from "./providers/mock";
import { GroqWhisperProvider } from "./providers/groqWhisper";
import { OpenAIWhisperProvider } from "./providers/openaiWhisper";
import { env } from "../config/env";

/** Factory — เลือก STT provider ตามค่า env STT_PROVIDER (เช่นเดียวกับ AI provider) */
export function getSTTProvider(): STTProvider {
  const name = env.DEMO_MODE ? "mock" : env.STT_PROVIDER;
  switch (name) {
    case "groq_whisper":
      return new GroqWhisperProvider();
    case "openai_whisper":
      return new OpenAIWhisperProvider();
    case "mock":
    default:
      return new MockSTTProvider();
  }
}
