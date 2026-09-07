# 🐷🐱 LINE AI Personal Secretary

AI เลขาส่วนตัวผ่าน LINE Official Account ที่เข้าใจภาษาไทยธรรมชาติ (พิมพ์หรือพูดก็ได้) และจัดการ Task, Reminder,
นัดหมาย, การเงิน (บิล/หนี้), และความจำส่วนตัวให้อัตโนมัติ — ออกแบบให้เริ่มต้นได้ **ฟรี 100%** ไม่มีค่าใช้จ่ายรายเดือน

```
User (พิมพ์/พูดไทย) → LINE → Webhook → AI แปลความ (intent) → Tool layer → Database
                                                                              ↓
                                                              Scheduler (cron ฟรี ทุก 1 นาที)
                                                                              ↓
                                                              LINE Push แจ้งเตือน (พร้อมปุ่มกด)
```

## ตัวอย่างการใช้งาน

```
คุณ: พรุ่งนี้เก้าโมงเตือนฉันไปส่งเอกสารนะ
บอท: ได้เลยค่ะ 🐷⏰ ฉันจะเตือนวัน 11/09/2026 09:00 เรื่อง "ไปส่งเอกสาร" นะคะ

... พรุ่งนี้เวลา 09:00 ...
บอท: 🔔 ถึงเวลาไปส่งเอกสารแล้วค่ะ
     [✅ เสร็จแล้ว]  [⏰ เลื่อน 1 ชั่วโมง]  [📅 พรุ่งนี้]
```

## ฟีเจอร์หลัก

การจัดการงานและนัดหมาย: สร้าง/แก้ไข/ลบ Task, Reminder (แบบครั้งเดียวและแบบซ้ำ: ทุกวัน/สัปดาห์/เดือน/ปี/ทุกวันที่ N),
นัดหมาย, snooze, complete, reschedule ผ่านภาษาพูดธรรมชาติโดยไม่ต้องจำคำสั่งตายตัว

การเงิน: บันทึกบิลที่ต้องจ่าย หนี้ (พร้อมดอกเบี้ย/ยอดคงเหลือ/งวดที่เหลือ) และสรุปยอดรายเดือน/รายสัปดาห์

ความจำ: บันทึก ค้นหา และลืมข้อมูลสำคัญที่ผู้ใช้เคยบอกไว้ แยกเป็นส่วนตัวของแต่ละคนอย่างเคร่งครัด

เสียง: รองรับข้อความเสียงภาษาไทยผ่าน Speech-to-Text แบบ pluggable provider

บทสรุปประจำวัน: Daily briefing ตอนเช้าและ Evening summary ตอนเย็น (เปิด/ปิดได้ต่อผู้ใช้)

## สถาปัตยกรรม

โปรเจกต์นี้แยกเป็นโมดูลชัดเจนตามความรับผิดชอบ:

- `src/line` — webhook, signature verification, LINE Messaging API client, quick reply/postback
- `src/ai` — AI provider abstraction (Gemini/Groq/OpenAI/OpenRouter/Mock) + intent classification (prompt-based JSON contract, ไม่ผูกกับ provider ใดโดยเฉพาะ)
- `src/speech` — Speech-to-Text provider abstraction (Groq Whisper/OpenAI Whisper/Mock)
- `src/nlu` — ตัวแปลงวันเวลาภาษาไทยแบบสัมพัทธ์ (พรุ่งนี้, อีก 30 นาที, ทุกวันที่ 1 ฯลฯ) เป็น absolute datetime
- `src/tasks`, `src/reminders`, `src/events`, `src/memory`, `src/finance` — service/tool layer (AI ไม่แตะ DB ตรง ๆ)
- `src/notifications` — reminder engine ที่ทำงานแยกจาก AI โดยสิ้นเชิงผ่าน scheduler tick
- `src/conversation` — เก็บบริบทการสนทนาล่าสุดเพื่อรองรับ slot-filling และการอ้างอิงแบบ "อันนั้น"
- `src/database` — Prisma client
- `src/demo` — CLI simulator สำหรับทดสอบโดยไม่ต้องมี LINE จริง
- `tests` — automated tests (Thai NLU, reminder engine, isolation, finance, webhook signature, voice pipeline)

## เหตุผลที่เลือกเทคโนโลยีเหล่านี้ (FREE-FIRST)

| ส่วนประกอบ | เทคโนโลยีที่เลือก | เหตุผล |
|---|---|---|
| Backend | Node.js + Express (TypeScript) | เขียนง่าย, documentation เยอะ, deploy ได้แทบทุก free-tier host |
| ฐานข้อมูล | SQLite (dev/demo) → PostgreSQL ผ่าน Supabase (production) | SQLite ใช้งานได้ทันทีไม่ต้องสมัคร, Supabase ฟรี 500MB ตลอดไปสำหรับ production |
| ORM | Prisma | type-safe, migration system ในตัว, เปลี่ยน database provider ได้ง่าย |
| AI | Provider abstraction: Gemini (แนะนำ) / Groq / OpenAI / OpenRouter / Mock | ไม่ผูกกับเจ้าใดเจ้าหนึ่ง, Gemini/Groq มี free tier ใจกว้างและเข้าใจภาษาไทยดี |
| Speech-to-Text | Provider abstraction: Groq Whisper (แนะนำ, ฟรี) / OpenAI Whisper / Mock | Whisper-large-v3 ผ่าน Groq ฟรีและเร็วมาก รองรับภาษาไทย |
| Scheduler | External free cron (cron-job.org) ยิง `/api/scheduler/tick` | ไม่ต้องพึ่ง cron ในตัว host (ซึ่งมักไม่มีในแผนฟรี) ทำงานได้แม้ AI ไม่ได้สนทนาอยู่ |
| Deploy | Render.com free web service | ฟรีตลอดไป ไม่ต้องใส่บัตรเครดิต, มี `render.yaml` blueprint พร้อมใช้ |

> หมายเหตุ: เราพิจารณา Cloudflare Workers + D1 ด้วย (serverless แท้ + cron ในตัวฟรี) แต่ Workers runtime มีข้อจำกัดกับ
> library บางตัว (เช่น การ stream ไฟล์เสียงขนาดใหญ่, บาง Node API) ทำให้การพัฒนาและ debug ยากกว่าสำหรับผู้เริ่มต้น
> จึงเลือก Node.js + Express ซึ่งยืดหยุ่นกว่าและยังคง deploy บนแผนฟรีได้เหมือนกัน

## เริ่มต้นใช้งาน

ดูคู่มือแบบละเอียดทีละขั้นตอนที่ **[SETUP.md](./SETUP.md)** — ครอบคลุมตั้งแต่รัน local, เชื่อม LINE, ไปจนถึง deploy จริง

สรุปแบบเร็ว:
```bash
npm install
cp .env.example .env
npm run prisma:generate && npx prisma migrate deploy
npm run demo   # ทดสอบคุยกับ AI ผ่าน terminal ทันที ไม่ต้องตั้งค่าอะไรเพิ่ม
```

## Local Development

```bash
npm run dev          # รัน server พร้อม hot-reload (tsx watch)
npm run prisma:studio # เปิด GUI ดูข้อมูลในฐานข้อมูล
npm run typecheck    # ตรวจสอบ type ทั้งโปรเจกต์
```

## Testing

```bash
npm test
```

ครอบคลุม: การแปลงวันเวลาภาษาไทย, การสร้าง/เลื่อน/ทำเสร็จ reminder, recurring reminder, การแยกข้อมูลระหว่างผู้ใช้ (user &
memory isolation), การคำนวณการเงิน, การตรวจสอบลายเซ็น LINE webhook, และ voice processing pipeline แบบ end-to-end
(ดูตัวอย่างคำสั่งภาษาไทยที่ใช้ทดสอบใน `src/demo/sampleCommands.md`)

## Deployment

ดู [SETUP.md หัวข้อ 6](./SETUP.md#6-deploy-ขึ้น-production) — แนะนำ Render.com ด้วยไฟล์ `render.yaml` ที่มีให้แล้ว

## DEMO_MODE vs Production

- `DEMO_MODE=true` (ค่าเริ่มต้น): ใช้ Mock AI + Mock STT ทั้งหมด ไม่ต้องมี LINE/AI credentials จริง เหมาะสำหรับพัฒนาและทดสอบ
- `DEMO_MODE=false`: ใช้บริการจริงตามที่ตั้งค่าใน `AI_PROVIDER`/`STT_PROVIDER` — ต้องกรอก API key ให้ครบตาม SETUP.md

## Rich Menu

ดู [docs/RICH_MENU.md](./docs/RICH_MENU.md) สำหรับวิธีตั้งค่าเมนูปุ่มลัดใน LINE (ไม่บังคับ — ผู้ใช้พิมพ์ภาษาธรรมชาติได้เสมอ)

## Security

- ตรวจสอบ LINE webhook signature ทุกครั้ง (HMAC-SHA256 timing-safe compare)
- ทุก record ในฐานข้อมูลผูกกับ internal `userId` ที่ map จาก LINE user ID เท่านั้น — ผู้ใช้คนหนึ่งเข้าถึงข้อมูลอีกคนไม่ได้
- Rate limiting ต่อผู้ใช้ (20 ข้อความ/นาที) ป้องกัน abuse และป้องกันใช้โควต้า AI ฟรีหมดเร็วเกินไป
- ไม่มี API key ฝังอยู่ใน source code ทั้งหมดอ่านจาก environment variables
- Log มีการ redact เนื้อหาข้อความผู้ใช้บางส่วน ไม่บันทึกข้อความเต็มโดยไม่จำเป็น

## Known Limitations (สิ่งที่ยังไม่สมบูรณ์ 100% ใน MVP นี้)

- การอ่านข้อความจากรูปภาพ (OCR) ยังไม่ได้เปิดใช้งานเต็มรูปแบบ — โครง handler พร้อมแล้ว (`src/line/handlers.ts`) รอเชื่อมกับ
  vision-capable provider (เช่น Gemini Vision) เพิ่มเติม
- ตัวแปลงเวลาภาษาไทยแบบ bare "N โมง" (ไม่มีคำว่า เช้า/เย็น/บ่าย ต่อท้าย) ตีความแบบตรงตัว (เช่น "หกโมง" = 6:00) ซึ่งในบางบริบท
  ผู้พูดอาจหมายถึงเวลาอื่น — เมื่อใช้ AI provider จริง (ไม่ใช่ mock) โมเดลจะช่วยตีความบริบทได้แม่นยำขึ้น
- โค้ดนี้เขียนและตรวจสอบไวยากรณ์ (TypeScript syntax check) แล้ว แต่ยังไม่ได้รันจริงผ่าน `npm install && npm test` ในสภาพแวดล้อมที่สร้างโปรเจกต์นี้
  (เครือข่ายไม่สามารถเข้าถึง npm registry ได้) — กรุณารัน `npm install && npm test` ในเครื่องของคุณเป็นขั้นตอนแรกหลังดาวน์โหลดโปรเจกต์
