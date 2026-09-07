# Smart Secretary Brain — สถานะงาน (บันทึกไว้ทำต่อ)

อัปเดตล่าสุด: 2026-09-07

## สรุปสิ่งที่ทำเสร็จแล้ว (commit ขึ้น GitHub main แล้วทั้งหมด)

ปรับปรุงระบบตามสเปก "Smart Secretary Brain" — ให้ AI เข้าใจบริบท แยก title ออกจากประโยคเต็ม
รองรับ CREATE_PAYMENT แบบข้อมูลไม่ครบก็บันทึกได้ก่อน, context resolver ข้ามหมวด, ฯลฯ

ไฟล์ที่แก้ไข/สร้างใหม่ (คอมมิตแล้วทุกไฟล์):
- prisma/schema.prisma — Payment.amount เปลี่ยนเป็น Float? (nullable)
- prisma/schema.postgres.prisma — เหมือนกัน
- src/finance/financeService.ts — เพิ่ม createPayment (amount null ได้), updatePaymentAmount,
  findLatestPaymentMissingAmount, findLatestPayment, findLatestDebt, updatePaymentDueDate,
  deletePayment, markDebtPaidOff, deleteDebt, แก้ getFinancialSummary ให้รองรับ amount=null
- src/events/eventService.ts — เพิ่ม findLatestEvent, updateEvent, deleteEvent
- src/conversation/contextService.ts — เพิ่ม EntityRefType, setLastEntityRef/getLastEntityRef
  รองรับ task/reminder/payment/debt/event
- src/ai/prompts/systemPrompt.ts — เขียนใหม่ทั้งหมด: system prompt สั่งให้ AI แยก title จากประโยคเต็ม,
  ไม่บังคับกรอกครบทุก field, เข้าใจคำอ้างอิงกำกวม (อันนั้น/เมื่อกี้ฯลฯ), ใช้บริบทข้ามข้อความ
- src/nlu/thaiDate.ts — เพิ่มการ parse วันที่แบบตัวเลขเต็ม (15/9/69, 1/10/2569) และชื่อเดือนไทย
  (วันที่ 1 ตุลาคม, 15 ก.ย. 2569) พร้อมแปลง พ.ศ./ค.ศ. อัตโนมัติ (normalizeYear)
- src/tools/index.ts — เขียนใหม่เกือบทั้งหมด: deriveCleanTitle (สกัด title สั้น ๆ), CREATE_PAYMENT
  แบบ amount=null ได้, FILL_PAYMENT_AMOUNT (เติมยอดทีหลัง), resolveTargetEntity (หา entity ข้ามหมวด
  task/reminder/payment/debt/event โดย exact match ก่อน แล้วค่อย substring, แล้วค่อย lastEntityRef,
  แล้วค่อย fallback ล่าสุดสุด), CREATE_REMINDER ถามเวลาถ้าไม่ระบุชัดเจน (ไม่เดา 9 โมงเงียบ ๆ)
- src/ai/providers/mock.ts — เพิ่ม pattern จับ CREATE_DEBT/CREATE_PAYMENT/FINANCIAL_SUMMARY
- tests/smartBrain.test.ts — เทสต์ใหม่ ~20 cases ครอบคลุม: parse วันที่ตัวเลข/ชื่อเดือนไทย,
  CREATE_PAYMENT ข้อมูลไม่ครบ, context resolution ข้ามหมวด, FINANCIAL_SUMMARY, title extraction,
  tool result validation
- .github/workflows/test.yml — เพิ่ม CI ใหม่ (รัน npm install, prisma generate, prisma db push
  กับ Postgres service container, typecheck, test, build) เพื่อให้มีที่รันเทสต์จริงได้
  (คลาวด์แซนด์บ็อกซ์ของ Claude เข้า npm registry / prisma binaries ไม่ได้ ต้องพึ่ง GitHub Actions แทน)

## ผลการรัน CI ครั้งแรก (สำคัญ)

รันแล้วเจอบั๊กจริง 2 จุด (จาก unit test จริง ไม่ใช่แค่ manual trace):
เวลา targetRef ระบุชื่อเจาะจง เช่น "ค่าไฟ" ระบบไปแมตช์ผิดกับ reminder ที่ระบบสร้างอัตโนมัติตอน
CREATE_PAYMENT (ชื่อ "จ่ายค่าไฟ 100 บาท" ซึ่งมีคำว่า "ค่าไฟ" อยู่ด้วยและสร้างทีหลัง payment เอง)
ทำให้ RESCHEDULE/DELETE ไปโดนของผิดตัว (แก้ reminder แทนที่จะแก้ payment)

**แก้แล้วในโค้ดโลคอล (cloud sandbox) แต่ยังไม่ได้ push ขึ้น GitHub** — ไฟล์ที่แก้:
`src/tools/index.ts` ฟังก์ชัน `resolveTargetEntity` — เพิ่มการเช็ค exact match (ชื่อตรงกันเป๊ะ) ก่อน
แล้วค่อย fallback ไป substring match เดิม (โค้ดที่แก้ไว้แล้วอยู่ใน section คอมเมนต์ "ต้องเช็ค exact
match ก่อนเสมอ" ในฟังก์ชันนี้)

## สิ่งที่ต้องทำต่อพรุ่งนี้ (ตามลำดับ)

1. **Push ไฟล์ `src/tools/index.ts` เวอร์ชันแก้แล้ว (มี exact-match fix) ขึ้น GitHub**
   ผ่าน GitHub web editor ที่ https://github.com/kitsanabb4-jpg/line-ai-secretary/edit/main/src/tools/index.ts
   (วิธี: คลิกเข้า editor -> Ctrl+A -> พิมพ์เนื้อหาไฟล์เต็มที่แก้แล้ว -> Commit changes)
2. รอ GitHub Actions "Test" workflow รันใหม่อัตโนมัติ (ดูที่แท็บ Actions) เช็คว่า test ผ่านครบทุกตัว
3. ถ้ายังมี test fail อื่นอีก ให้ไล่แก้ทีละตัวจนผ่านหมด (นี่คือข้อดีของการมี CI — เห็นบั๊กจริงจาก
   unit test แทนการเดา)
4. ตรวจสอบว่า Render deploy อัตโนมัติจาก GitHub main สำเร็จ (Render เชื่อมกับ repo นี้อยู่แล้ว)
5. ตรวจ LINE webhook / reminder scheduler / database CRUD ยังทำงานปกติหลัง deploy
6. สรุปให้ผู้ใช้: ไฟล์ที่แก้ทั้งหมด, สิ่งที่ดีขึ้น, และตัวอย่างข้อความภาษาไทยอย่างน้อย 10 ตัวอย่าง
   ให้ลองทดสอบจริงผ่าน LINE (เช่น "การเงิน ค่าไฟ วันที่ 15/9/69", "เดือนนี้ต้องจ่ายอะไรบ้าง",
   "วันที่ 1 ตุลาคม เวลา 12:00 เตือนว่า ยกเลิก คลอสโค้ด" ฯลฯ — ตามตัวอย่างที่ผู้ใช้ให้มาตอนแรก)
7. หมายเหตุ: AI_PROVIDER ยัง = "mock" ใน render.yaml (ยังไม่ได้ Gemini/Groq/OpenRouter API key จริง
   เพราะติด CAPTCHA/fraud detection ตอนสมัคร) ดังนั้นความฉลาดเต็มรูปแบบของ AI (แยก title/เข้าใจ
   ประโยคอ้อม ๆ) จะยังไม่เต็มร้อยจนกว่าจะได้ API key จริงมาต่อ — อาจต้องกลับไปแก้ปัญหานี้ต่อด้วย

## ไฟล์นี้

ลบไฟล์นี้ทิ้งได้เมื่องานเสร็จสมบูรณ์แล้ว (สร้างไว้แค่กันลืม context ระหว่าง session)
