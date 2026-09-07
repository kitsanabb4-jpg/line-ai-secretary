// Logger กลาง — redact เนื้อหาข้อความผู้ใช้บางส่วนเพื่อความเป็นส่วนตัว (ตาม SECURITY requirement)

function redact(text: string, maxLen = 40): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}… (${text.length} chars)`;
}

function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    console.log(`[${ts()}] INFO  ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(`[${ts()}] WARN  ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  error: (msg: string, err?: unknown) => {
    console.error(`[${ts()}] ERROR ${msg}`, err instanceof Error ? err.stack : err);
  },
  // ใช้ log ข้อความผู้ใช้แบบ redact แล้วเท่านั้น ห้าม log ข้อความเต็มโดยไม่จำเป็น
  userMessage: (userId: string, direction: "IN" | "OUT", content: string) => {
    console.log(`[${ts()}] MSG   user=${userId.slice(0, 8)}… dir=${direction} content="${redact(content)}"`);
  },
};

export { redact };
