/**
 * CLI Demo Simulator — จำลองการคุยกับ AI เลขาผ่าน terminal โดยไม่ต้องมี LINE จริง
 * รันด้วย: npm run demo
 * ต้องตั้ง DEMO_MODE=true ใน .env (ค่าเริ่มต้นอยู่แล้ว)
 */
import readline from "readline";
import { findOrCreateUser } from "../users/userService";
import { handleUserMessage } from "../ai/intent";
import { env } from "../config/env";

const DEMO_LINE_USER_ID = "demo-user-001";

const SAMPLE_COMMANDS = [
  "พรุ่งนี้เก้าโมงเตือนฉันไปส่งเอกสารนะ",
  "วันที่ 15 เตือนฉันจ่ายค่าโทรศัพท์ 1280 บาท",
  "เดือนนี้ฉันมีอะไรต้องจ่ายบ้าง",
  "จำไว้ว่าทุกวันที่ 1 ฉันต้องจ่ายค่าเช่า",
  "พรุ่งนี้ฉันมีอะไร",
  "วันนี้ฉันมีอะไร",
  "เมื่อกี้ฉันบอกให้แกเตือนอะไรนะ",
];

async function main() {
  console.log("🐷🐱 LINE AI Personal Secretary — DEMO MODE");
  console.log(`DEMO_MODE=${env.DEMO_MODE} (ถ้าเป็น false ระบบจะพยายามเรียก provider จริง)`);
  console.log("พิมพ์ข้อความภาษาไทยเพื่อคุยกับ AI เลขา หรือพิมพ์ 'ตัวอย่าง' เพื่อดูคำสั่งตัวอย่าง, 'exit' เพื่อออก\n");

  const user = await findOrCreateUser(DEMO_LINE_USER_ID, "Demo User");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question("คุณ> ", async (input) => {
    if (input.trim().toLowerCase() === "exit") {
      rl.close();
      return;
    }
    if (input.trim() === "ตัวอย่าง") {
      console.log("\nลองพิมพ์คำสั่งเหล่านี้ดูได้เลยค่ะ:");
      SAMPLE_COMMANDS.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
      console.log("");
      ask();
      return;
    }
    try {
      const reply = await handleUserMessage(user.id, input);
      console.log(`น้องหมูเบา> ${reply}\n`);
    } catch (err: any) {
      console.error("เกิดข้อผิดพลาด:", err?.message || err);
    }
    ask();
  });
  ask();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
