import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // รันไฟล์เทสต์ทีละไฟล์ (ไม่ parallel) เพราะใช้ SQLite ไฟล์เดียวร่วมกัน ป้องกัน database lock
    fileParallelism: false,
    testTimeout: 15000,
    include: ["tests/**/*.test.ts"],
  },
});
