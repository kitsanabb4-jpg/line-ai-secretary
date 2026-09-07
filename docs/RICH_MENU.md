# Rich Menu Configuration

Rich Menu คือเมนูรูปภาพที่ปักหมุดอยู่ด้านล่างของหน้าแชท LINE ผู้ใช้แตะปุ่มแทนการพิมพ์ได้
ระบบนี้**ไม่บังคับ**ต้องมี Rich Menu — ผู้ใช้พิมพ์ภาษาธรรมชาติได้เสมอ แต่ Rich Menu ช่วยให้ผู้ใช้ใหม่เข้าใจฟีเจอร์ได้เร็วขึ้น

## เมนูที่แนะนำ (2x3 grid)

| ปุ่ม | ข้อความที่จะส่งเมื่อกด |
|---|---|
| 🏠 วันนี้ | `วันนี้ฉันมีอะไร` |
| 📅 ตาราง | `สัปดาห์นี้ฉันมีอะไร` |
| ✅ งาน | `งานที่ค้างอยู่มีอะไรบ้าง` |
| 💰 การเงิน | `เดือนนี้ต้องจ่ายอะไรบ้าง` |
| 🧠 ความจำ | `ค้นความจำ` |
| ⚙️ ตั้งค่า | `เปิดสรุปประจำวัน` |

## วิธีสร้างผ่าน LINE Official Account Manager (ไม่ต้องเขียนโค้ด — แนะนำสำหรับผู้เริ่มต้น)

1. เข้า https://manager.line.biz/ เลือก OA ของคุณ
2. เมนูซ้าย -> "Rich menu" -> "Create rich menu"
3. ตั้งชื่อ, เลือก template แบบ 6 ช่อง (2x3)
4. อัปโหลดรูปพื้นหลัง (ออกแบบเองหรือใช้เครื่องมือฟรีอย่าง Canva ธีมสีชมพูพาสเทล 🐷🐱)
5. ในแต่ละช่อง ตั้ง Action เป็น "Text" แล้วใส่ข้อความตามตารางด้านบน (ระบบจะเข้าใจเหมือนผู้ใช้พิมพ์เอง)
6. กด "Publish" — เสร็จแล้ว ผู้ใช้ทุกคนที่แอดบอทจะเห็นเมนูนี้ทันที

## วิธีสร้างผ่าน API (ถ้าต้องการทำอัตโนมัติ)

ดูเอกสารทางการของ LINE: https://developers.line.biz/en/docs/messaging-api/using-rich-menus/

ตัวอย่างโครงสร้าง JSON (ใช้กับ `POST https://api.line.me/v2/bot/richmenu`):

```json
{
  "size": { "width": 2500, "height": 1686 },
  "selected": true,
  "name": "main-menu",
  "chatBarText": "เมนู 🐷",
  "areas": [
    { "bounds": { "x": 0, "y": 0, "width": 833, "height": 843 }, "action": { "type": "message", "text": "วันนี้ฉันมีอะไร" } },
    { "bounds": { "x": 833, "y": 0, "width": 834, "height": 843 }, "action": { "type": "message", "text": "สัปดาห์นี้ฉันมีอะไร" } },
    { "bounds": { "x": 1667, "y": 0, "width": 833, "height": 843 }, "action": { "type": "message", "text": "งานที่ค้างอยู่มีอะไรบ้าง" } },
    { "bounds": { "x": 0, "y": 843, "width": 833, "height": 843 }, "action": { "type": "message", "text": "เดือนนี้ต้องจ่ายอะไรบ้าง" } },
    { "bounds": { "x": 833, "y": 843, "width": 834, "height": 843 }, "action": { "type": "message", "text": "ค้นความจำ" } },
    { "bounds": { "x": 1667, "y": 843, "width": 833, "height": 843 }, "action": { "type": "message", "text": "เปิดสรุปประจำวัน" } }
  ]
}
```

หลังสร้างแล้วต้องอัปโหลดรูปภาพและตั้งเป็น default menu ด้วย endpoint `POST /v2/bot/user/all/richmenu/{richMenuId}`
