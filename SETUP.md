# SETUP.md — คู่มือติดตั้งแบบละเอียด (สำหรับผู้เริ่มต้น)

คู่มือนี้เขียนให้คนที่ **ไม่เคยทำ backend มาก่อน** ก็ทำตามได้ทีละขั้นตอน ใช้เวลาประมาณ 30-60 นาที
ทุกบริการที่แนะนำเป็น **ฟรี** ทั้งหมด (ไม่มีค่าใช้จ่ายรายเดือน) เว้นแต่จะระบุไว้ชัดเจนว่าเป็นทางเลือกเสริม

---

## สารบัญ
1. [สิ่งที่ต้องสมัคร](#1-สิ่งที่ต้องสมัคร)
2. [ติดตั้งและรันแบบ Local (DEMO_MODE)](#2-ติดตั้งและรันแบบ-local-demo_mode)
3. [ตั้งค่า Environment Variables ทีละตัว](#3-ตั้งค่า-environment-variables-ทีละตัว)
4. [เชื่อมต่อ LINE Official Account](#4-เชื่อมต่อ-line-official-account)
5. [ตั้งค่าฐานข้อมูลจริง (Production)](#5-ตั้งค่าฐานข้อมูลจริง-production)
6. [Deploy ขึ้น Production](#6-deploy-ขึ้น-production)
7. [ตั้งค่า Scheduler (Reminder ให้ทำงานอัตโนมัติ)](#7-ตั้งค่า-scheduler-reminder-ให้ทำงานอัตโนมัติ)
8. [ทดสอบ Webhook](#8-ทดสอบ-webhook)
9. [ทดสอบ Voice Message](#9-ทดสอบ-voice-message)
10. [ทดสอบ Reminder](#10-ทดสอบ-reminder)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. สิ่งที่ต้องสมัคร

ทำตอนไหนก็ได้ แต่ต้องทำให้ครบก่อนใช้งานจริง (production) — **ตอน demo/ทดสอบในเครื่องยังไม่ต้องสมัครอะไรเลย**

| บริการ | ใช้ทำอะไร | ฟรีแค่ไหน | ลิงก์สมัคร |
|---|---|---|---|
| LINE Developers | สร้าง LINE Official Account + Messaging API | ฟรี 100% | https://developers.line.biz/console/ |
| Google AI Studio (Gemini) | AI เข้าใจภาษาไทย (แนะนำอันดับ 1) | ฟรี (มี rate limit ต่อวัน) | https://aistudio.google.com/app/apikey |
| Groq | AI สำรอง + Speech-to-Text (Whisper ฟรี) | ฟรี (มี rate limit) | https://console.groq.com/keys |
| Supabase | ฐานข้อมูล Postgres สำหรับ production | ฟรี 500MB ตลอดไป | https://supabase.com |
| Render | โฮสต์ backend (deploy ฟรี) | ฟรีตลอดไป (มี sleep หลัง idle) | https://render.com |
| cron-job.org | ยิง scheduler ทุก 1 นาที (ฟรี ไม่ต้องใช้บัตรเครดิต) | ฟรี 100% | https://cron-job.org |

> ไม่ต้องสมัครทุกอันพร้อมกัน! ทำตามลำดับในคู่มือนี้ทีละขั้นตอน

---

## 2. ติดตั้งและรันแบบ Local (DEMO_MODE)

โหมดนี้ไม่ต้องสมัครอะไรเลย ใช้ทดสอบว่าระบบเข้าใจภาษาไทยและจัดการ Task/Reminder ได้ถูกต้องหรือไม่

```bash
# 1) ติดตั้ง Node.js เวอร์ชัน 18 ขึ้นไปก่อน (ถ้ายังไม่มี) จาก https://nodejs.org

# 2) เข้าโฟลเดอร์โปรเจกต์
cd line-ai-secretary

# 3) ติดตั้ง dependency ทั้งหมด
npm install

# 4) คัดลอกไฟล์ environment ตัวอย่าง
cp .env.example .env
# ไม่ต้องแก้อะไรเลย! ค่าเริ่มต้น DEMO_MODE=true ใช้งานได้ทันที

# 5) สร้างฐานข้อมูล SQLite (ไฟล์เดียว ไม่ต้องติดตั้งอะไรเพิ่ม)
npm run prisma:generate
npx prisma migrate deploy

# 6) ทดสอบผ่าน CLI (จำลองแชท LINE ในเทอร์มินัล)
npm run demo
```

จากนั้นลองพิมพ์: `พรุ่งนี้เก้าโมงเตือนฉันไปส่งเอกสารนะ` แล้วดูว่าน้องหมูเบาตอบว่าอะไร 🐷

หรือรัน server จริงในเครื่อง (ยังเป็น DEMO_MODE ก็ได้):
```bash
npm run dev
# server จะรันที่ http://localhost:3000
# ทดสอบว่าทำงานอยู่: curl http://localhost:3000/api/health
```

---

## 3. ตั้งค่า Environment Variables ทีละตัว

เปิดไฟล์ `.env` (ที่ copy มาจาก `.env.example`) แล้วกรอกทีละตัวตามนี้:

| ตัวแปร | คำอธิบาย | จำเป็นเมื่อไหร่ |
|---|---|---|
| `DEMO_MODE` | `true` = ใช้ mock ทั้งหมด ไม่ต้องมี API key จริง / `false` = production | เปลี่ยนเป็น `false` ตอนใช้งานจริง |
| `PORT` | พอร์ตที่ server รัน | ปกติไม่ต้องแก้ (Render จะกำหนดให้อัตโนมัติ) |
| `APP_TIMEZONE` | timezone ของผู้ใช้ทั้งหมด | ปล่อยเป็น `Asia/Bangkok` |
| `DATABASE_URL` | connection string ของฐานข้อมูล | ดูหัวข้อ 5 |
| `LINE_CHANNEL_ACCESS_TOKEN` | token สำหรับส่งข้อความผ่าน LINE | ดูหัวข้อ 4 |
| `LINE_CHANNEL_SECRET` | secret สำหรับตรวจสอบ webhook | ดูหัวข้อ 4 |
| `AI_PROVIDER` | `gemini` \| `groq` \| `openai` \| `openrouter` \| `mock` | ตั้งเป็น `gemini` แนะนำ |
| `GEMINI_API_KEY` | API key จาก Google AI Studio | ถ้าเลือก `AI_PROVIDER=gemini` |
| `GROQ_API_KEY` | API key จาก Groq (ใช้ได้ทั้ง AI และ STT) | ถ้าเลือก `AI_PROVIDER=groq` หรือ `STT_PROVIDER=groq_whisper` |
| `OPENAI_API_KEY` | API key จาก OpenAI (มีค่าใช้จ่าย) | เฉพาะถ้าอยากใช้ OpenAI |
| `STT_PROVIDER` | `groq_whisper` \| `openai_whisper` \| `mock` | ตั้งเป็น `groq_whisper` แนะนำ (ฟรี) |
| `SCHEDULER_SECRET` | รหัสลับป้องกัน endpoint scheduler | สร้างค่าสุ่มยาว ๆ เอง เช่นจาก https://www.uuidgenerator.net |

**วิธีขอ Gemini API Key (ฟรี):**
1. เข้า https://aistudio.google.com/app/apikey
2. ล็อกอินด้วย Google Account
3. กด "Create API key" -> คัดลอกค่าไปใส่ใน `GEMINI_API_KEY`

**วิธีขอ Groq API Key (ฟรี — ใช้ได้ทั้ง AI และแปลงเสียง):**
1. เข้า https://console.groq.com/keys
2. สมัครสมาชิก (ฟรี ไม่ต้องใส่บัตรเครดิต)
3. กด "Create API Key" -> คัดลอกค่าไปใส่ใน `GROQ_API_KEY`

---

## 4. เชื่อมต่อ LINE Official Account

1. เข้า https://developers.line.biz/console/ ล็อกอินด้วยบัญชี LINE
2. สร้าง Provider ใหม่ (ตั้งชื่ออะไรก็ได้ เช่น "MyCompany")
3. สร้าง Channel ใหม่ -> เลือก **"Messaging API"**
4. กรอกข้อมูลพื้นฐาน (ชื่อบอท, รูปโปรไฟล์, หมวดหมู่) -> สร้าง
5. เข้าไปที่ channel ที่สร้าง -> แท็บ **"Messaging API"**:
   - เลื่อนลงหา **"Channel access token"** -> กด **Issue** -> คัดลอกค่าไปใส่ `LINE_CHANNEL_ACCESS_TOKEN`
   - เลื่อนขึ้นไปแท็บ **"Basic settings"** -> คัดลอก **"Channel secret"** ไปใส่ `LINE_CHANNEL_SECRET`
6. กลับไปแท็บ "Messaging API":
   - **Webhook URL**: ใส่ `https://<โดเมนที่ deploy แล้ว>/api/webhook` (ต้อง deploy ก่อนถึงจะมี URL นี้ — ดูหัวข้อ 6)
   - เปิด **"Use webhook"** เป็น ON
   - ปิด **"Auto-reply messages"** และ **"Greeting messages"** เป็น OFF (ไม่งั้นจะชนกับข้อความที่บอทตอบเอง)
7. สแกน QR Code ในหน้า Messaging API เพื่อแอดบอทเป็นเพื่อนด้วย LINE ของคุณเอง แล้วลองส่งข้อความทดสอบ

---

## 5. ตั้งค่าฐานข้อมูลจริง (Production)

**สำคัญมาก:** ค่าเริ่มต้นของโปรเจกต์ใช้ SQLite (ไฟล์เดียวในเครื่อง) ซึ่งเหมาะกับ local dev/demo เท่านั้น
เพราะบริการ hosting ฟรีส่วนใหญ่ (รวมถึง Render) จะ**ลบไฟล์ที่เขียนขึ้นมาใหม่ทุกครั้งที่ deploy** (ephemeral disk)
ถ้าใช้ SQLite บน production ข้อมูล Task/Reminder ของผู้ใช้จะหายเมื่อมีการ deploy ใหม่หรือ restart!

**สำหรับ production ต้องใช้ Postgres (Supabase ฟรี 500MB) แทน** ทำตามนี้:

1. สมัคร https://supabase.com -> สร้างโปรเจกต์ใหม่ (เลือก region สิงคโปร์ใกล้ไทยที่สุด)
2. ไปที่ Project Settings -> Database -> คัดลอก **Connection string** (เลือกแบบ "Connection pooling" ถ้ามี, ใช้ URI แบบ `postgresql://...`)
3. นำมาใส่ใน `DATABASE_URL` (ใน `.env` สำหรับทดสอบ หรือใน environment variables ของ Render ตอน deploy)
4. เปลี่ยน schema ให้ใช้ Postgres:
   ```bash
   cp prisma/schema.postgres.prisma prisma/schema.prisma
   npx prisma migrate dev --name init
   ```
   คำสั่งนี้จะสร้างไฟล์ migration สำหรับ Postgres ให้อัตโนมัติ (แทนที่ migration ของ SQLite เดิม)
5. commit ไฟล์ migration ใหม่ที่ได้ขึ้น git ด้วย

---

## 6. Deploy ขึ้น Production

แนะนำ **Render.com** (ฟรีตลอดไป ไม่ต้องใส่บัตรเครดิต):

1. Push โค้ดขึ้น GitHub repository ของคุณ
2. เข้า https://dashboard.render.com -> New -> **Blueprint** -> เชื่อมกับ repo ของคุณ
   (โปรเจกต์นี้มีไฟล์ `render.yaml` อยู่แล้ว Render จะอ่านค่าตั้งค่าจากไฟล์นี้อัตโนมัติ)
3. ในหน้า Environment ของ service ที่สร้าง ให้กรอกค่าที่ยังขาด (ตัวที่ทำเครื่องหมาย `sync: false` ใน render.yaml):
   `DATABASE_URL`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `SCHEDULER_SECRET`
4. กด Deploy — รอสักครู่จะได้ URL เช่น `https://line-ai-secretary.onrender.com`
5. นำ URL นี้ไปตั้งเป็น Webhook URL ใน LINE Developers Console (ดูหัวข้อ 4 ข้อ 6): `https://line-ai-secretary.onrender.com/api/webhook`

**ทางเลือกอื่น:** Railway, Fly.io, หรือ VPS ฟรี/ราคาถูกอื่น ๆ ก็ใช้ได้เช่นกัน เพียงแค่ต้อง `npm install && npm run build` แล้วรัน `npm start` โดยตั้ง environment variables ให้ครบ

---

## 7. ตั้งค่า Scheduler (Reminder ให้ทำงานอัตโนมัติ)

Reminder ต้องมีตัวจุดชนวนจากภายนอกมาเรียก endpoint `/api/scheduler/tick` ทุก 1 นาที (ฟรี ไม่มีค่าใช้จ่าย):

1. เข้า https://cron-job.org สมัครสมาชิกฟรี (ไม่ต้องใส่บัตรเครดิต)
2. สร้าง cronjob ใหม่:
   - **URL**: `https://<โดเมนของคุณ>/api/scheduler/tick?secret=<ค่าเดียวกับ SCHEDULER_SECRET>`
   - **Schedule**: ทุก 1 นาที (`* * * * *`)
   - **Request method**: GET
3. บันทึกแล้วเปิดใช้งาน — ระบบจะเรียก endpoint นี้ทุกนาทีตลอดเวลา แม้ไม่มีใครคุยกับบอทอยู่
4. ผลพลอยได้: การยิงทุก 1 นาทีนี้ยังช่วยไม่ให้ Render free service "หลับ" (sleep) จาก inactivity ด้วย

> ทางเลือกอื่นสำหรับ scheduler: UptimeRobot, GitHub Actions (scheduled workflow), หรือ Vercel Cron (ถ้าย้ายไป deploy บน Vercel)

---

## 8. ทดสอบ Webhook

**แบบ local (ก่อน deploy จริง):**
```bash
# 1) รัน server ในเครื่อง
npm run dev

# 2) เปิด terminal อีกอันหนึ่ง เปิดอุโมงค์ public ด้วย ngrok (ฟรี) เพื่อให้ LINE เรียกเข้ามาที่เครื่องเราได้
npx ngrok http 3000
# จะได้ URL เช่น https://xxxx.ngrok-free.app

# 3) นำ URL นั้นไปตั้งใน LINE Developers Console: https://xxxx.ngrok-free.app/api/webhook
```

**ทดสอบด้วยมือ (ไม่ต้องมี LINE จริง):**
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"message","replyToken":"dummy","source":{"userId":"test-user-1","type":"user"},"message":{"id":"1","type":"text","text":"วันนี้ฉันมีอะไร"}}]}'
```
(ใช้งานได้เฉพาะตอน `DEMO_MODE=true` เพราะจะข้ามการตรวจสอบลายเซ็น LINE)

**หลัง deploy จริง:** ใน LINE Developers Console แท็บ Messaging API มีปุ่ม **"Verify"** ข้าง Webhook URL ให้กดทดสอบว่าเชื่อมต่อสำเร็จหรือไม่

---

## 9. ทดสอบ Voice Message

1. เปิด `DEMO_MODE=false` และตั้งค่า `STT_PROVIDER=groq_whisper` พร้อม `GROQ_API_KEY`
2. แอดบอทเป็นเพื่อนใน LINE จริง แล้วกดปุ่มไมโครโฟนอัดเสียงพูดว่า
   > "พรุ่งนี้สิบโมงเตือนฉันไปส่งเอกสาร แล้วตอนหกโมงเย็นเตือนซื้อของด้วย"
3. ระบบจะ: ดาวน์โหลดไฟล์เสียง -> ส่งให้ Groq Whisper ถอดเป็นข้อความ -> ส่งให้ AI แปลความ -> สร้าง reminder 2 รายการ -> ตอบกลับสรุปให้ทันที
4. ถ้าอยากทดสอบ pipeline นี้โดยไม่ต้องมี LINE จริง ให้รัน `npm test -- voicePipeline` (ใช้ mock STT ที่คืนประโยคตัวอย่างคงที่)

---

## 10. ทดสอบ Reminder

1. ส่งข้อความ: `อีก 2 นาทีเตือนฉันทดสอบระบบ` (ใช้เวลาสั้น ๆ เพื่อทดสอบเร็ว)
2. รอ scheduler tick ทำงาน (ถ้าตั้ง cron-job.org ไว้แล้วจะทำงานอัตโนมัติทุกนาที)
3. หรือเรียก tick ด้วยมือเพื่อทดสอบทันที:
   ```bash
   curl -X POST "http://localhost:3000/api/scheduler/tick?secret=<SCHEDULER_SECRET>"
   ```
4. ควรได้รับข้อความแจ้งเตือนพร้อมปุ่ม [เสร็จแล้ว] [เลื่อน 1 ชั่วโมง] [พรุ่งนี้] ทาง LINE
5. ทดสอบกดปุ่มแต่ละอันว่าทำงานถูกต้อง (reminder เปลี่ยนสถานะ/เวลาใน DB จริง — ตรวจสอบได้ด้วย `npx prisma studio`)

---

## 11. Troubleshooting

| ปัญหา | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| Webhook verify ไม่ผ่าน | Webhook URL ผิด หรือ server ยังไม่ได้ deploy | ตรวจสอบว่า URL ลงท้ายด้วย `/api/webhook` และ server รันอยู่จริง |
| บอทไม่ตอบเลย | `LINE_CHANNEL_ACCESS_TOKEN` ผิด หรือหมดอายุ | Issue token ใหม่ใน LINE Developers Console |
| บอทตอบว่า "ระบบ AI มีปัญหา" | AI API key ผิด/หมดโควต้าฟรีรายวัน | ตรวจ `GEMINI_API_KEY`/`GROQ_API_KEY` หรือลองสลับ `AI_PROVIDER` |
| Voice message ไม่ถูกแปลงเป็นข้อความ | `STT_PROVIDER` ยังเป็น `mock` หรือ API key ผิด | ตั้ง `STT_PROVIDER=groq_whisper` และใส่ `GROQ_API_KEY` ให้ถูก |
| Reminder ไม่เด้งแจ้งเตือนตามเวลา | ยังไม่ได้ตั้ง cron-job.org หรือ `SCHEDULER_SECRET` ไม่ตรงกัน | ตรวจสอบ cronjob ทำงานจริง (ดู log ใน cron-job.org) และ secret ตรงกัน |
| ข้อมูลหายหลัง deploy ใหม่ | ยังใช้ SQLite บน production (ephemeral disk) | เปลี่ยนไปใช้ Postgres ตามหัวข้อ 5 |
| `npm run prisma:migrate` error "Environment variable not found: DATABASE_URL" | ยังไม่ได้สร้างไฟล์ `.env` | รัน `cp .env.example .env` ก่อน |
| Render service ตอบช้ามาก (ครั้งแรกหลัง idle) | Render free tier sleep หลัง 15 นาทีไม่มีคนเรียก | ตั้ง cron-job.org ยิงทุก 1 นาที จะช่วยไม่ให้ sleep |
