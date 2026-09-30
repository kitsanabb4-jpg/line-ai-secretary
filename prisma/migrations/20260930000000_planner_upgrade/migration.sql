-- Planner upgrade: add status/priority/recurrence fields to Task & Event,
-- add FinanceRecord table for the basic income/expense ledger.
-- Purely additive (ADD COLUMN / CREATE TABLE) so it is safe to run against
-- the existing production database regardless of the historical
-- SQLite-syntax "init" migration already recorded as applied there.

-- AlterTable: Task
ALTER TABLE "Task" ADD COLUMN "priority" TEXT;
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- AlterTable: Event
ALTER TABLE "Event" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE "Event" ADD COLUMN "priority" TEXT;
ALTER TABLE "Event" ADD COLUMN "reminderMinutes" INTEGER;
ALTER TABLE "Event" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "Event" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateTable: FinanceRecord
CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinanceRecord_userId_idx" ON "FinanceRecord"("userId");
CREATE INDEX "FinanceRecord_date_idx" ON "FinanceRecord"("date");
