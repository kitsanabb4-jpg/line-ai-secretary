// AI Provider Abstraction Layer
// ทุก provider (Gemini/Groq/OpenAI/OpenRouter/Mock) ต้อง implement interface นี้เหมือนกัน
// เพื่อให้สลับ provider ได้โดยไม่ต้องแก้ business logic เลย (ตาม ABSOLUTE REQUIREMENT: FREE-FIRST)

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
}

export interface AIProvider {
  name: string;
  /** ส่งบทสนทนาไปให้ AI แล้วได้ text กลับมา (คาดหวังเป็น JSON string ตาม contract ใน prompts/systemPrompt.ts) */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
