// Rate limiter อย่างง่ายแบบ in-memory (เหมาะกับ single-instance free-tier deployment)
// จำกัดจำนวนข้อความต่อ user ต่อหน่วยเวลา เพื่อป้องกัน abuse / ป้องกันยิง AI API รัว ๆ จนเปลืองโควต้าฟรี

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 นาที
const MAX_REQUESTS = 20; // ข้อความต่อผู้ใช้ต่อนาที

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS;
}

// เคลียร์ bucket เก่าเป็นระยะ ป้องกัน memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();
