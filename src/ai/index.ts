import { AIProvider } from "./provider";
import { MockAIProvider } from "./providers/mock";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { OpenAIProvider } from "./providers/openai";
import { OpenRouterProvider } from "./providers/openrouter";
import { env } from "../config/env";

/**
 * Factory — เลือก AI provider ตามค่า env AI_PROVIDER
 * ห้าม hard-code provider ใด provider หนึ่งในโค้ดฝั่ง business logic
 * โค้ดส่วนอื่นทั้งหมดเรียกผ่าน getAIProvider() เท่านั้น
 */
export function getAIProvider(): AIProvider {
  const name = env.DEMO_MODE ? "mock" : env.AI_PROVIDER;
  switch (name) {
    case "gemini":
      return new GeminiProvider();
    case "groq":
      return new GroqProvider();
    case "openai":
      return new OpenAIProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "mock":
    default:
      return new MockAIProvider();
  }
}
