import { prisma } from "../database/client";
import { nowInTz } from "../utils/timezone";

export async function createPayment(userId: string, data: { title: string; amount: number; dueDate: Date; isRecurring?: boolean; recurrenceRule?: string }) {
  return prisma.payment.create({ data: { userId, ...data } });
}

export async function markPaymentPaid(userId: string, paymentId: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!p) throw new Error("ไม่พบรายการนี้");
  return prisma.payment.update({ where: { id: paymentId }, data: { status: "PAID", paidAt: new Date() } });
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

  const totalThisMonth = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
  const totalThisWeek = paymentsThisWeek.reduce((sum, p) => sum + p.amount, 0);
  const totalDebtRemaining = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const upcomingDebt = debts.filter((d) => d.dueDate).sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))[0];

  return { paymentsThisMonth, paymentsThisWeek, debts, totalThisMonth, totalThisWeek, totalDebtRemaining, upcomingDebt };
}
