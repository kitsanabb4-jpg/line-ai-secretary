import dotenv from "dotenv";
dotenv.config();

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return v.toLowerCase() === "true" || v === "1";
}

export const env = {
  DEMO_MODE: bool(process.env.DEMO_MODE, true),
  PORT: parseInt(process.env.PORT || "3000", 10),
  APP_TIMEZONE: process.env.APP_TIMEZONE || "Asia/Bangkok",

  DATABASE_URL: process.env.DATABASE_URL || "",

  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || "",

  AI_PROVIDER: (process.env.AI_PROVIDER || "mock").toLowerCase(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",

  STT_PROVIDER: (process.env.STT_PROVIDER || "mock").toLowerCase(),
  STT_GROQ_MODEL: process.env.STT_GROQ_MODEL || "whisper-large-v3",
  STT_OPENAI_MODEL: process.env.STT_OPENAI_MODEL || "whisper-1",

  SCHEDULER_SECRET: process.env.SCHEDULER_SECRET || "",

  DEFAULT_DAILY_BRIEFING_TIME: process.env.DEFAULT_DAILY_BRIEFING_TIME || "07:00",
  DEFAULT_EVENING_SUMMARY_TIME: process.env.DEFAULT_EVENING_SUMMARY_TIME || "20:00",
  DEFAULT_DAILY_BRIEFING_ENABLED: bool(process.env.DEFAULT_DAILY_BRIEFING_ENABLED, false),
  DEFAULT_EVENING_SUMMARY_ENABLED: bool(process.env.DEFAULT_EVENING_SUMMARY_ENABLED, false),

  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
