import { prisma } from "../database/client";
import { nowInTz } from "../utils/timezone";

/** amount เป็น null ได้ — เช่นตอนผู้ใช้บอกแค่ "ค่าไฟ วันที่ 15" ยังไม่บอกยอด ก็บันทึกไว้ก่อนแล้วถามยอดทีหลัง (ห้ามบังคับกรอกครบทุก field) */
export async function createPayment(userId: string, data: { title: string; amount?: number | null; dueDate: Date; isRecurring?: boolean; recurrenceRule?: string }) {
  return prisma.payment.create({ data: { userId, ...data, amount: data.amount ?? null } });
}

/** เติมยอดเงินให้รายการที่เคยบันทึกไว้แบบยังไม่รู้ยอด (แทนที่จะสร้างรายการใหม่ซ้ำ) */
export async function updatePaymentAmount(userId: string, paymentId: string, amount: number) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p) throw new Error("ไม่พบรายการนี้ หรือไม่ใช่ของคุณ");
  return prisma.payment.update({ where: { id: paymentId }, data: { amount } });
}

/** หารายการเงินล่าสุดที่ยังไม่รู้ยอด (ใช้ตอนผู้ใช้เพิ่งถูกถามยอด แล้วตอบกลับมาเป็นตัวเลขเฉย ๆ) */
export async function findLatestPaymentMissingAmount(userId: string) {
  return prisma.payment.findFirst({ where: { userId, amount: null }, orderBy: { createdAt: "desc" } });
}

/** หารายการเงิน/หนี้ล่าสุด ใช้เป็นตัวช่วย resolve การอ้างอิงแบบ "อันนั้น"/"รายการล่าสุด" ข้ามหมวดการเงิน */
export async function findLatestPayment(userId: string) {
  return prisma.payment.findFirst({ where: { userId, status: { not: "PAID" } }, orderBy: { createdAt: "desc" } });
}

export async function findLatestDebt(userId: string) {
  return prisma.debt.findFirst({ where: { userId, status: { not: "PAID_OFF" } }, orderBy: { createdAt: "desc" } });
}

export async function markPaymentPaid(userId: string, paymentId: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p) throw new Error("ไม่พบรายการนี้");
  return prisma.payment.update({ where: { id: paymentId }, data: { status: "PAID", paidAt: new Date() } });
}

export async function updatePaymentDueDate(userId: string, paymentId: string, dueDate: Date) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p) throw new Error("ไม่พบรายการนี้ หรือไม่ใช่ของคุณ");
  return prisma.payment.update({ where: { id: paymentId }, data: { dueDate } });
}

export async function deletePayment(userId: string, paymentId: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p) throw new Error("ไม่พบรายการนี้ หรือไม่ใช่ของคุณ");
  return prisma.payment.delete({ where: { id: paymentId } });
}

export async function createDebt(
  userId: string,
  data: {
    creditor: string;
    originalAmount: number;
    remainingAmount?: number;
    minimumPayment?: number;
    interestRate?: number;
    dueDate?: Date;
    installmentsRemaining?: number;
  }
) {
  return prisma.debt.create({
    data: {
      userId,
      creditor: data.creditor,
      originalAmount: data.originalAmount,
      remainingAmount: data.remainingAmount ?? data.originalAmount,
      minimumPayment: data.minimumPayment,
      interestRate: data.interestRate,
      dueDate: data.dueDate,
      installmentsRemaining: data.installmentsRemaining,
    },
  });
}

export async function markDebtPaidOff(userId: string, debtId: string) {
  const d = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!d) throw new Error("ไม่พบรายการหนี้นี้ หรือไม่ใช่ของคุณ");
  return prisma.debt.update({ where: { id: debtId }, data: { status: "PAID_OFF", remainingAmount: 0 } });
}

export async function deleteDebt(userId: string, debtId: string) {
  const d = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!d) throw new Error("ไม่พบรายการหนี้นี้ หรือไม่ใช่ของคุณ");
  return prisma.debt.delete({ where: { id: debtId } });
}

/** สรุปการเงิน: "เดือนนี้ต้องจ่ายอะไรบ้าง", "ฉันมีหนี้อะไร", "หนี้ไหนใกล้ครบกำหนด", "สัปดาห์นี้เงินออกเท่าไหร่" */
export async function getFinancialSummary(userId: string) {
  const startOfMonth = nowInTz().startOf("month").toDate();
  const endOfMonth = nowInTz().endOf("month").toDate();
  const startOfWeek = nowInTz().startOf("day").toDate();
  const endOfWeek = nowInTz().add(7, "day").endOf("day").toDate();

  const [paymentsThisMonth, paymentsThisWeek, debts] = await Promise.all([
    prisma.payment.findMany({ where: { userId, dueDate: { gte: startOfMonth, lte: endOfMonth }, status: { not: "PAID" } }, orderBy: { dueDate: "asc" } }),
    prisma.payment.findMany({ where: { userId, dueDate: { gte: startOfWeek, lte: endOfWeek }, status: { not: "PAID" } }, orderBy: { dueDate: "asc" } }),
    prisma.debt.findMany({ where: { userId, status: { not: "PAID_OFF" } }, orderBy: { dueDate: "asc" } }),
  ]);

  const totalThisMonth = paymentsThisMonth.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const totalThisWeek = paymentsThisWeek.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const totalDebtRemaining = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const upcomingDebt = debts.filter((d) => d.dueDate).sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))[0];

  return { paymentsThisMonth, paymentsThisWeek, debts, totalThisMonth, totalThisWeek, totalDebtRemaining, upcomingDebt };
}
