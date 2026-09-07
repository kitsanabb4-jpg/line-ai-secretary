import { describe, it, expect } from "vitest";
import { parseThaiDateTime, parseThaiTime, parseRecurrence, parseOffsetBeforeDue, computeNextOccurrence } from "../src/nlu/thaiDate";
import { dayjs, APP_TZ } from "../src/utils/timezone";

// ใช้เวลาอ้างอิงคงที่เพื่อให้เทสต์ deterministic: วันพุธที่ 10 กันยายน 2026 เวลา 08:00 (Asia/Bangkok)
const REF = dayjs.tz("2026-09-10 08:00", "YYYY-MM-DD HH:mm", APP_TZ);

describe("parseThaiTime", () => {
  it("แปลง 'เก้าโมงเช้า' เป็น 09:00", () => {
    expect(parseThaiTime("เก้าโมงเช้า")).toEqual({ hour: 9, minute: 0, matched: "เก้าโมงเช้า" });
  });
  it("แปลง 'หกโมงเย็น' เป็น 18:00", () => {
    const r = parseThaiTime("หกโมงเย็น");
    expect(r?.hour).toBe(18);
    expect(r?.minute).toBe(0);
  });
  it("แปลง 'บ่ายสองโมง' เป็น 14:00", () => {
    const r = parseThaiTime("บ่ายสองโมง");
    expect(r?.hour).toBe(14);
  });
  it("แปลง 'เที่ยง' เป็น 12:00", () => {
    expect(parseThaiTime("เที่ยง")?.hour).toBe(12);
  });
  it("แปลงเวลาตัวเลข '14:30' ได้ตรง ๆ", () => {
    expect(parseThaiTime("14:30")).toEqual({ hour: 14, minute: 30, matched: "14:30" });
  });
});

describe("parseThaiDateTime — วันและเวลาสัมพัทธ์", () => {
  it("'พรุ่งนี้เก้าโมง' -> วันถัดไป 09:00", () => {
    const result = parseThaiDateTime("พรุ่งนี้เก้าโมง", REF);
    expect(result).not.toBeNull();
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-11 09:00");
  });

  it("'พรุ่งนี้สิบโมง' -> วันถัดไป 10:00", () => {
    const result = parseThaiDateTime("พรุ่งนี้สิบโมง", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-11 10:00");
  });

  it("'วันนี้หกโมงเย็น' -> วันนี้ 18:00", () => {
    const result = parseThaiDateTime("วันนี้หกโมงเย็น", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-10 18:00");
  });

  it("'อีก 30 นาที' -> ref + 30 นาที", () => {
    const result = parseThaiDateTime("อีก 30 นาที", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-10 08:30");
  });

  it("'อีก 2 ชั่วโมง' -> ref + 2 ชั่วโมง", () => {
    const result = parseThaiDateTime("อีก 2 ชั่วโมง", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-10 10:00");
  });

  it("'วันที่ 15 เวลา 9:00' -> วันที่ 15 เดือนปัจจุบัน", () => {
    const result = parseThaiDateTime("วันที่ 15 เวลา 9:00", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD HH:mm")).toBe("2026-09-15 09:00");
  });

  it("'มะรืนนี้' -> ref + 2 วัน", () => {
    const result = parseThaiDateTime("มะรืนนี้เก้าโมง", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD")).toBe("2026-09-12");
  });

  it("'สิ้นเดือน' -> วันสุดท้ายของเดือน", () => {
    const result = parseThaiDateTime("สิ้นเดือนเวลา 18:00", REF);
    const d = dayjs(result!.date).tz(APP_TZ);
    expect(d.format("YYYY-MM-DD")).toBe("2026-09-30");
  });
});

describe("parseRecurrence", () => {
  it("'ทุกวันที่ 1' -> MONTHLY dayOfMonth=1", () => {
    expect(parseRecurrence("ทุกวันที่ 1")).toEqual({ type: "MONTHLY", dayOfMonth: 1 });
  });
  it("'ทุกวัน' -> DAILY", () => {
    expect(parseRecurrence("ทุกวันเวลา 8 โมง")).toEqual({ type: "DAILY" });
  });
  it("'ทุกสัปดาห์' -> WEEKLY", () => {
    expect(parseRecurrence("ทุกสัปดาห์")).toEqual({ type: "WEEKLY" });
  });
});

describe("parseOffsetBeforeDue", () => {
  it("'ก่อนวันครบกำหนด 3 วัน' -> 3*24*60 นาที", () => {
    expect(parseOffsetBeforeDue("ก่อนวันครบกำหนด 3 วัน")).toBe(3 * 24 * 60);
  });
  it("'ก่อน 30 นาที' -> 30", () => {
    expect(parseOffsetBeforeDue("ก่อน 30 นาที")).toBe(30);
  });
});

describe("computeNextOccurrence", () => {
  it("MONTHLY dayOfMonth=1 เลื่อนไปเดือนถัดไปวันที่ 1", () => {
    const current = dayjs.tz("2026-09-01 09:00", "YYYY-MM-DD HH:mm", APP_TZ).toDate();
    const next = computeNextOccurrence(current, { type: "MONTHLY", dayOfMonth: 1 });
    expect(dayjs(next).tz(APP_TZ).format("YYYY-MM-DD")).toBe("2026-10-01");
  });
  it("DAILY เลื่อนไปวันถัดไปเวลาเดิม", () => {
    const current = dayjs.tz("2026-09-10 08:00", "YYYY-MM-DD HH:mm", APP_TZ).toDate();
    const next = computeNextOccurrence(current, { type: "DAILY" });
    expect(dayjs(next).tz(APP_TZ).format("YYYY-MM-DD HH:mm")).toBe("2026-09-11 08:00");
  });
});
