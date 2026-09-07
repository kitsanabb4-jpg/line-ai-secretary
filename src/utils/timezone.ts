import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/th";
import { env } from "../config/env";

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TZ = env.APP_TIMEZONE || "Asia/Bangkok";

/** เวลาปัจจุบัน ณ timezone ของแอป */
export function nowInTz() {
  return dayjs().tz(APP_TZ);
}

/** แปลง Date (เก็บใน DB เป็น UTC) ให้เป็น dayjs object ใน timezone ของแอป */
export function toAppTz(date: Date) {
  return dayjs(date).tz(APP_TZ);
}

/** สร้าง Date จาก y/m/d/h/m ใน timezone ของแอป แล้วคืนเป็น UTC Date สำหรับเก็บ DB */
export function makeDateInTz(y: number, m: number, d: number, h: number, min: number) {
  return dayjs.tz(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, "YYYY-MM-DD HH:mm", APP_TZ).toDate();
}

export function formatThaiDateTime(date: Date): string {
  const d = toAppTz(date);
  return d.format("DD/MM/YYYY HH:mm");
}

export function formatThaiTime(date: Date): string {
  return toAppTz(date).format("HH:mm");
}

export { dayjs };
