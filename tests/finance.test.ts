import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers";
import * as financeService from "../src/finance/financeService";
import { nowInTz } from "../src/utils/timezone";

describe("Finance calculations", () => {
  it("getFinancialSummary รวมยอดที่ต้องจ่ายเดือนนี้ถูกต้อง", async () => {
    const user = await createTestUser("finance-summary");
    const dueDate1 = nowInTz().date(15).toDate();
    const dueDate2 = nowInTz().date(20).toDate();

    await financeService.createPayment(user.id, { title: "ค่าโทรศัพท์", amount: 1280, dueDate: dueDate1 });
    await financeService.createPayment(user.id, { title: "ค่าไฟ", amount: 850, dueDate: dueDate2 });

    const summary = await financeService.getFinancialSummary(user.id);
    const totalOfOurPayments = summary.paymentsThisMonth
      .filter((p) => p.userId === user.id)
      .reduce((sum, p) => sum + p.amount, 0);

    expect(totalOfOurPayments).toBe(2130);
  });

  it("คำนวณยอดหนี้คงเหลือรวมถูกต้อง", async () => {
    const user = await createTestUser("finance-debt");
    await financeService.createDebt(user.id, { creditor: "บัตรเครดิต A", originalAmount: 20000, remainingAmount: 15000 });
    await financeService.createDebt(user.id, { creditor: "สินเชื่อ B", originalAmount: 50000, remainingAmount: 30000 });

    const summary = await financeService.getFinancialSummary(user.id);
    expect(summary.totalDebtRemaining).toBe(45000);
    expect(summary.debts).toHaveLength(2);
  });

  it("markPaymentPaid เปลี่ยนสถานะเป็น PAID และไม่นับในสรุปเดือนนี้อีก", async () => {
    const user = await createTestUser("finance-paid");
    const payment = await financeService.createPayment(user.id, { title: "ค่าเน็ต", amount: 590, dueDate: nowInTz().date(5).toDate() });
    await financeService.markPaymentPaid(user.id, payment.id);

    const summary = await financeService.getFinancialSummary(user.id);
    expect(summary.paymentsThisMonth.find((p) => p.id === payment.id)).toBeUndefined();
  });
});
