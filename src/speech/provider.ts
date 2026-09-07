// Speech-to-Text Provider Abstraction Layer — ห้าม hard-code provider ใด provider หนึ่ง

export interface STTProvider {
  name: string;
  /** รับไฟล์เสียง (buffer) + นามสกุลไฟล์ (LINE ส่งมาเป็น .m4a) คืนข้อความภาษาไทยที่ถอดได้ */
  transcribe(audio: Buffer, fileExt?: string): Promise<string>;
}
