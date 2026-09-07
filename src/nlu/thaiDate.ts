/**
 * Thai natural-language date/time parser
 * แปลงข้อความภาษาไทยที่พูดถึงวันเวลาแบบ relative ให้เป็น absolute datetime (Asia/Bangkok)
 * ก่อนบันทึกลงฐานข้อมูลเสมอ (ตาม NATURAL LANGUAGE requirement)
 *
 * ออกแบบให้ใช้ได้ 2 แบบ:
 *  1) รับ "วลี" สั้น ๆ ที่ AI provider ดึงมาให้แล้ว เช่น dateText="พรุ่งนี้", timeText="สิบโมง"
 *  2) รับข้อความเต็มแล้ว scan หา pattern เอง (ใช้เป็น fallback สำหรับ mock provider / เขียนเทสต์)
 */
import { dayjs, APP_TZ, nowInTz } from "../utils/timezone";

export interface ParsedRecurrence {
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  dayOfMonth?: number; // สำหรับ "ทุกวันที่ N"
  weekday?: number; // 0=อาทิตย์ .. 6=เสาร์ สำหรับ "ทุกวันจันทร์"
}

export interface ParsedDateTime {
  date: Date; // absolute datetime (UTC-backed Date object) พร้อมเก็บ DB
  matched: string[]; // วลีที่ match แล้ว (ไว้ตัดออกจาก title)
  recurrence?: ParsedRecurrence;
  offsetMinutesBeforeDue?: number; // สำหรับ "ก่อนวันครบกำหนด 3 วัน" ฯลฯ
  hadExplicitTime: boolean;
}

const THAI_DIGIT_WORDS: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5,
  หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10,
};

const WEEKDAYS: Record<string, number> = {
  อาทิตย์: 0, จันทร์: 1, อังคาร: 2, พุธ: 3, พฤหัส: 4, พฤหัสบดี: 4, ศุกร์: 5, เสาร์: 6,
};

// ชื่อเดือนไทย (เต็มและย่อ) -> เลขเดือน 1-12 ใช้กับ "วันที่ 1 ตุลาคม", "15 ก.ย. 2569" ฯลฯ
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, "ม.ค.": 1, มค: 1,
  กุมภาพันธ์: 2, "ก.พ.": 2, กพ: 2,
  มีนาคม: 3, "มี.ค.": 3, มีค: 3,
  เมษายน: 4, "เม.ย.": 4, เมย: 4,
  พฤษภาคม: 5, "พ.ค.": 5, พค: 5,
  มิถุนายน: 6, "มิ.ย.": 6, มิย: 6,
  กรกฎาคม: 7, "ก.ค.": 7, กค: 7,
  สิงหาคม: 8, "ส.ค.": 8, สค: 8,
  กันยายน: 9, "ก.ย.": 9, กย: 9,
  ตุลาคม: 10, "ต.ค.": 10, ตค: 10,
  พฤศจิกายน: 11, "พ.ย.": 11, พย: 11,
  ธันวาคม: 12, "ธ.ค.": 12, ธค: 12,
};
// เรียงชื่อเดือนจากยาวไปสั้น กัน regex match ผิดตัว (เช่น "มีนาคม" ต้องมาก่อน "มีค")
const THAI_MONTH_PATTERN = Object.keys(THAI_MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/\./g, "\\."))
  .join("|");

/** แปลงปี พ.ศ. (2 หรือ 4 หลัก) หรือ ค.ศ. ให้เป็น ค.ศ. เสมอ เช่น 69 หรือ 2569 -> 2026, 2026 -> 2026 คงเดิม */
function normalizeYear(y: number): number {
  if (y < 100) return y + 2500 - 543; // เลขปีย่อ 2 หลัก ถือว่าเป็น พ.ศ. เสมอ เช่น "69" -> 2569 -> 2026
  if (y >= 2400) return y - 543; // พ.ศ. 4 หลัก -> ค.ศ.
  return y; // ค.ศ. อยู่แล้ว
}

/** แปลงเลขไทยแบบคำพูด เช่น "สิบเอ็ด" -> 11, "ยี่สิบสาม" -> 23 ให้เป็นตัวเลข (รองรับ 0-31 พอสำหรับวันที่/ชั่วโมง) */
function thaiWordsToNumber(word: string): number | null {
  word = word.trim();
  if (/^\d+$/.test(word)) return parseInt(word, 10);
  if (word === "สิบ") return 10;
  if (word === "ยี่สิบ") return 20;
  if (word === "สามสิบ") return 30;

  const tensMatch = word.match(/^(ยี่|สาม)?สิบ(.*)$/);
  if (tensMatch) {
    const tensWord = tensMatch[1];
    const onesWord = tensMatch[2];
    let tens = 10;
    if (tensWord === "ยี่") tens = 20;
    else if (tensWord === "สาม") tens = 30;
    if (!onesWord) return tens;
    const ones = THAI_DIGIT_WORDS[onesWord];
    if (ones === undefined) return null;
    return tens + ones;
  }
  if (THAI_DIGIT_WORDS[word] !== undefined) return THAI_DIGIT_WORDS[word];
  return null;
}

const NUM_WORD_PATTERN = "(?:\\d{1,2}|(?:ยี่สิบ|สามสิบ|สิบ)?(?:เอ็ด|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?)";

/** พยายามหาตัวเลข (ไทยหรืออารบิก) จาก substring ที่ระบุ */
function extractNumber(s: string): number | null {
  const digit = s.match(/\d{1,2}/);
  if (digit) return parseInt(digit[0], 10);
  return thaiWordsToNumber(s);
}

// ---------------------------------------------------------------------
// เวลา (time of day)
// ---------------------------------------------------------------------
export function parseThaiTime(text: string): { hour: number; minute: number; matched: string } | null {
  // 1) เวลาแบบตัวเลข HH:mm หรือ HH.mm เช่น "14:30", "9.00"
  let m = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (m) return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10), matched: m[0] };

  // 2) เที่ยง / เที่ยงคืน
  if (/เที่ยงคืน/.test(text)) return { hour: 0, minute: 0, matched: "เที่ยงคืน" };
  if (/เที่ยง(?!คืน)/.test(text)) return { hour: 12, minute: 0, matched: "เที่ยง" };

  // 3) ตี N (ตีหนึ่ง..ตีห้า) = 01:00-05:00
  m = text.match(/ตี(หนึ่ง|สอง|สาม|สี่|ห้า|\d)/);
  if (m) {
    const n = extractNumber(m[1]);
    if (n !== null) return { hour: n, minute: 0, matched: m[0] };
  }

  // 4) N ทุ่ม (หนึ่งทุ่ม=19:00 ... ห้าทุ่ม=23:00)
  m = text.match(/(หนึ่ง|สอง|สาม|สี่|ห้า|\d)\s*ทุ่ม/);
  if (m) {
    const n = extractNumber(m[1]);
    if (n !== null) return { hour: 18 + n, minute: 0, matched: m[0] };
  }

  // 5) บ่ายโมง (=13:00) / บ่าย N โมง (บ่ายสองโมง=14:00 ... บ่ายห้าโมง=17:00)
  m = text.match(/บ่าย(สอง|สาม|สี่|ห้า|\d)?\s*โมง/);
  if (m) {
    const n = m[1] ? extractNumber(m[1]) : 1;
    if (n !== null) return { hour: 12 + n, minute: 0, matched: m[0] };
  }

  // 6) N โมงเช้า (เจ็ดโมงเช้า=07:00 ... สิบเอ็ดโมงเช้า=11:00), เที่ยงไม่ใช้คำนี้
  m = text.match(/(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบเอ็ด|สิบ|\d{1,2})\s*โมงเช้า/);
  if (m) {
    const n = extractNumber(m[1]);
    if (n !== null) return { hour: n === 12 ? 0 : n, minute: 0, matched: m[0] };
  }

  // 7) N โมงเย็น (ห้าโมงเย็น=17:00, หกโมงเย็น=18:00)
  m = text.match(/(ห้า|หก|\d)\s*โมงเย็น/);
  if (m) {
    const n = extractNumber(m[1]);
    if (n !== null) return { hour: 12 + n, minute: 0, matched: m[0] };
  }

  // 8) bare "N โมง" ไม่มี เช้า/เย็น/บ่าย ต่อท้าย — ตีความเป็นเวลากลางวัน (7-11 เช้า, 12=เที่ยง, ที่เหลือคงค่า)
  m = text.match(/(สิบเอ็ด|สิบ|เก้า|แปด|เจ็ด|หก|ห้า|สี่|สาม|สอง|หนึ่ง|\d{1,2})\s*โมง(?!เช้า|เย็น)/);
  if (m) {
    const n = extractNumber(m[1]);
    if (n !== null) {
      const hour = n === 12 ? 12 : n; // ค่าเริ่มต้น: ตีความตามตัวเลขตรง ๆ (1-11 = ช่วงเช้า/บ่ายตามบริบท ผู้ใช้ปรับได้)
      return { hour, minute: 0, matched: m[0] };
    }
  }

  // 9) "N โมง M" (นาทีเป็นตัวเลข) เช่น "เก้าโมงสามสิบ"
  m = text.match(/(สิบเอ็ด|สิบ|เก้า|แปด|เจ็ด|หก|ห้า|สี่|สาม|สอง|หนึ่ง|\d{1,2})\s*โมง\s*(สามสิบ|ยี่สิบ|สิบ|\d{1,2})/);
  if (m) {
    const h = extractNumber(m[1]);
    const min = extractNumber(m[2]);
    if (h !== null && min !== null) return { hour: h, minute: min, matched: m[0] };
  }

  return null;
}

// ---------------------------------------------------------------------
// วันที่ (date)
// ---------------------------------------------------------------------
export function parseThaiDate(text: string, ref = nowInTz()): { y: number; m: number; d: number; matched: string } | null {
  // วันนี้
  if (/วันนี้/.test(text)) return { y: ref.year(), m: ref.month() + 1, d: ref.date(), matched: "วันนี้" };
  // คืนนี้
  if (/คืนนี้/.test(text)) return { y: ref.year(), m: ref.month() + 1, d: ref.date(), matched: "คืนนี้" };
  // มะรืน(นี้)
  if (/มะรืน(นี้)?/.test(text)) {
    const d = ref.add(2, "day");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: text.match(/มะรืน(นี้)?/)![0] };
  }
  // พรุ่งนี้ (เช้า/เย็น เป็นแค่ตัวบอกเวลา ให้ parseThaiTime จัดการต่อ)
  if (/พรุ่งนี้/.test(text)) {
    const d = ref.add(1, "day");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: "พรุ่งนี้" };
  }
  // สิ้นเดือน
  if (/สิ้นเดือน/.test(text)) {
    const d = ref.endOf("month");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: "สิ้นเดือน" };
  }
  // ต้นเดือน (ของเดือนถัดไป ถ้าผ่านวันที่ 1 ของเดือนนี้ไปแล้ว มักหมายถึงเดือนหน้า)
  if (/ต้นเดือน/.test(text)) {
    const base = ref.date() === 1 ? ref : ref.add(1, "month").date(1);
    return { y: base.year(), m: base.month() + 1, d: 1, matched: "ต้นเดือน" };
  }
  // เดือนหน้า (วันเดียวกัน)
  if (/เดือนหน้า/.test(text)) {
    const d = ref.add(1, "month");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: "เดือนหน้า" };
  }
  // อาทิตย์หน้า / สัปดาห์หน้า (บวก 7 วัน)
  if (/(อาทิตย์|สัปดาห์)หน้า/.test(text)) {
    const d = ref.add(7, "day");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: text.match(/(อาทิตย์|สัปดาห์)หน้า/)![0] };
  }
  // วันที่แบบตัวเลขเต็ม D/M/Y หรือ D-M-Y เช่น "15/9/69", "1/10/2569", "15-09-2026"
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = normalizeYear(parseInt(m[3], 10));
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { y: year, m: month, d: day, matched: m[0] };
    }
  }
  // วันที่ + ชื่อเดือนไทย เช่น "วันที่ 1 ตุลาคม", "15 ก.ย. 2569", "1 ต.ค. 69"
  m = text.match(new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${THAI_MONTH_PATTERN})\\s*(\\d{2,4})?`));
  if (m) {
    const day = parseInt(m[1], 10);
    const month = THAI_MONTHS[m[2]];
    if (day >= 1 && day <= 31 && month) {
      let year = m[3] ? normalizeYear(parseInt(m[3], 10)) : ref.year();
      let candidate = ref.year(year).month(month - 1).date(day);
      // ไม่ได้ระบุปีมาเอง และวันที่นั้นผ่านไปแล้วในปีปัจจุบัน -> หมายถึงปีหน้า
      if (!m[3] && candidate.isBefore(ref, "day")) {
        candidate = candidate.add(1, "year");
        year = candidate.year();
      }
      return { y: year, m: month, d: day, matched: m[0] };
    }
  }
  // ทุกวันที่ N / วันที่ N (เดือนนี้ ถ้าผ่านไปแล้วเลื่อนไปเดือนหน้า)
  m = text.match(/วันที่\s*(\d{1,2}|[ก-๙]{1,10})/);
  if (m) {
    const day = extractNumber(m[1]);
    if (day && day >= 1 && day <= 31) {
      let candidate = ref.date(day);
      if (candidate.isBefore(ref, "day") && !/ทุกวันที่/.test(text)) {
        candidate = candidate.add(1, "month");
      }
      return { y: candidate.year(), m: candidate.month() + 1, d: day > 28 ? Math.min(day, candidate.daysInMonth()) : day, matched: m[0] };
    }
  }
  // อีก N วัน
  m = text.match(/อีก\s*(\d{1,3})\s*วัน/);
  if (m) {
    const d = ref.add(parseInt(m[1], 10), "day");
    return { y: d.year(), m: d.month() + 1, d: d.date(), matched: m[0] };
  }
  // วันจันทร์..วันอาทิตย์ (สัปดาห์นี้ถ้ายังไม่ผ่าน ไม่งั้นสัปดาห์หน้า)
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    const re = new RegExp(`วัน${name}`);
    if (re.test(text)) {
      let d = ref;
      const diff = (wd - ref.day() + 7) % 7;
      d = ref.add(diff === 0 ? 7 : diff, "day"); // ถ้าตรงกับวันนี้พอดี ให้หมายถึงสัปดาห์หน้า (กันสับสนกับ "วันนี้")
      return { y: d.year(), m: d.month() + 1, d: d.date(), matched: re.exec(text)![0] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Recurrence (ทุกวัน / ทุกสัปดาห์ / ทุกเดือน / ทุกวันที่ N)
// ---------------------------------------------------------------------
export function parseRecurrence(text: string): ParsedRecurrence | null {
  let m = text.match(/ทุกวันที่\s*(\d{1,2})/);
  if (m) return { type: "MONTHLY", dayOfMonth: parseInt(m[1], 10) };
  if (/ทุกวัน(?!ที่)/.test(text)) return { type: "DAILY" };
  if (/ทุก(สัปดาห์|อาทิตย์)/.test(text)) return { type: "WEEKLY" };
  if (/ทุกเดือน/.test(text)) return { type: "MONTHLY" };
  if (/ทุกปี/.test(text)) return { type: "YEARLY" };
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`ทุกวัน${name}`).test(text)) return { type: "WEEKLY", weekday: wd };
  }
  return null;
}

/** "ก่อนวันครบกำหนด 3 วัน", "ก่อน 30 นาที", "ก่อน 1 ชั่วโมง" -> จำนวนนาทีที่ต้องเตือนล่วงหน้า */
export function parseOffsetBeforeDue(text: string): number | null {
  let m = text.match(/ก่อน(?:วันครบกำหนด)?\s*(\d{1,3})\s*วัน/);
  if (m) return parseInt(m[1], 10) * 24 * 60;
  m = text.match(/ก่อน\s*(\d{1,3})\s*ชั่วโมง/);
  if (m) return parseInt(m[1], 10) * 60;
  m = text.match(/ก่อน\s*(\d{1,3})\s*นาที/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** "อีก 30 นาที" / "อีก 2 ชั่วโมง" — offset จาก "ตอนนี้" ไปในอนาคต (ไม่ใช่ due date, ใช้กับ CREATE_REMINDER ตรง ๆ) */
function parseRelativeFromNow(text: string, ref = nowInTz()): { date: Date; matched: string } | null {
  let m = text.match(/อีก\s*(\d{1,4})\s*นาที/);
  if (m) return { date: ref.add(parseInt(m[1], 10), "minute").toDate(), matched: m[0] };
  m = text.match(/อีก\s*(\d{1,3})\s*ชั่วโมง/);
  if (m) return { date: ref.add(parseInt(m[1], 10), "hour").toDate(), matched: m[0] };
  return null;
}

/**
 * ฟังก์ชันหลัก: พยายาม parse ข้อความ (หรือวลีสั้น ๆ) ให้เป็น absolute datetime
 * คืนค่า null ถ้าหาช่วงเวลาที่ระบุได้ชัดเจนไม่เจอเลย
 */
export function parseThaiDateTime(text: string, ref = nowInTz()): ParsedDateTime | null {
  const matched: string[] = [];

  // เคสพิเศษ: "อีก N นาที/ชั่วโมง" คือทั้งวันและเวลาในตัวเดียว
  const relative = parseRelativeFromNow(text, ref);
  if (relative) {
    return { date: relative.date, matched: [relative.matched], hadExplicitTime: true, recurrence: parseRecurrence(text) || undefined };
  }

  const datePart = parseThaiDate(text, ref);
  const timePart = parseThaiTime(text);
  const recurrence = parseRecurrence(text) || undefined;
  const offsetMinutesBeforeDue = parseOffsetBeforeDue(text) ?? undefined;

  if (!datePart && !timePart && !recurrence) return null;

  let base = ref;
  if (datePart) {
    base = base.year(datePart.y).month(datePart.m - 1).date(datePart.d);
    matched.push(datePart.matched);
  } else if (recurrence) {
    // ไม่มีวันที่ชัดเจนแต่มี recurrence เช่น "ทุกวันที่ 1" -> ใช้เดือนปัจจุบัน วันตาม recurrence
    if (recurrence.dayOfMonth) {
      let candidate = base.date(recurrence.dayOfMonth);
      if (candidate.isBefore(base, "day")) candidate = candidate.add(1, "month");
      base = candidate;
    }
  }

  let hour = 9; // ค่าเริ่มต้นถ้าไม่ระบุเวลา (09:00 เช้า)
  let minute = 0;
  let hadExplicitTime = false;
  if (timePart) {
    hour = timePart.hour;
    minute = timePart.minute;
    hadExplicitTime = true;
    matched.push(timePart.matched);
  } else if (/เย็น/.test(text)) {
    hour = 18;
  } else if (/เช้า/.test(text)) {
    hour = 8;
  } else if (/คืนนี้/.test(text) || /กลางคืน/.test(text)) {
    hour = 20;
  }

  const finalDate = base.hour(hour).minute(minute).second(0).millisecond(0);

  return {
    date: finalDate.toDate(),
    matched,
    recurrence,
    offsetMinutesBeforeDue,
    hadExplicitTime,
  };
}

export function computeNextOccurrence(current: Date, recurrence: ParsedRecurrence): Date {
  const d = dayjs(current).tz(APP_TZ);
  switch (recurrence.type) {
    case "DAILY":
      return d.add(1, "day").toDate();
    case "WEEKLY":
      return d.add(7, "day").toDate();
    case "MONTHLY": {
      const next = d.add(1, "month");
      if (recurrence.dayOfMonth) {
        const day = Math.min(recurrence.dayOfMonth, next.daysInMonth());
        return next.date(day).toDate();
      }
      return next.toDate();
    }
    case "YEARLY":
      return d.add(1, "year").toDate();
    default:
      return d.add(1, "day").toDate();
  }
}
