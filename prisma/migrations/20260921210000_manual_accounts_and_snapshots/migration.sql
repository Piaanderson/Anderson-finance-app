-- CreateEnum
CREATE TYPE "PositionSnapshotSource" AS ENUM ('PLAID_SYNC', 'MANUAL');

-- AlterTable
ALTER TABLE "FinancialAccount"
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Manual accounts always have a known ISO 4217 currency and current signed
-- position. UNCLASSIFIED remains a provider-only fallback.
ALTER TABLE "FinancialAccount"
ADD CONSTRAINT "FinancialAccount_manual_classification_check" CHECK (
  "source" <> 'MANUAL' OR "classification" <> 'UNCLASSIFIED'
),
ADD CONSTRAINT "FinancialAccount_manual_position_check" CHECK (
  "source" <> 'MANUAL'
  OR ("currentBalance" IS NOT NULL AND "isoCurrencyCode" IS NOT NULL)
),
ADD CONSTRAINT "FinancialAccount_currency_code_check" CHECK (
  "isoCurrencyCode" IS NULL OR "isoCurrencyCode" ~ '^[A-Z]{3}$'
);

-- CreateTable
CREATE TABLE "AccountPositionSnapshot" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "signedBalance" DECIMAL(18,2),
  "isoCurrencyCode" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "PositionSnapshotSource" NOT NULL,
  "dedupeKey" TEXT NOT NULL,

  CONSTRAINT "AccountPositionSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountPositionSnapshot_currency_code_check" CHECK (
    "isoCurrencyCode" IS NULL OR "isoCurrencyCode" ~ '^[A-Z]{3}$'
  )
);

-- CreateTable
CREATE TABLE "PropertyDebtLink" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "propertyAccountId" TEXT NOT NULL,
  "debtAccountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyDebtLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PropertyDebtLink_not_self_check" CHECK (
    "propertyAccountId" <> "debtAccountId"
  )
);

-- Existing positions are deliberately not backfilled into snapshots. Their
-- historical as-of times are unknown; the first real Plaid sync or manual
-- valuation after this migration starts honest history.

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_id_householdId_key" ON "FinancialAccount"("id", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPositionSnapshot_dedupeKey_key" ON "AccountPositionSnapshot"("dedupeKey");

-- CreateIndex
CREATE INDEX "AccountPositionSnapshot_householdId_effectiveAt_idx" ON "AccountPositionSnapshot"("householdId", "effectiveAt");

-- CreateIndex
CREATE INDEX "AccountPositionSnapshot_accountId_effectiveAt_observedAt_idx" ON "AccountPositionSnapshot"("accountId", "effectiveAt", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyDebtLink_propertyAccountId_debtAccountId_key" ON "PropertyDebtLink"("propertyAccountId", "debtAccountId");

-- CreateIndex
CREATE INDEX "PropertyDebtLink_householdId_idx" ON "PropertyDebtLink"("householdId");

-- CreateIndex
CREATE INDEX "PropertyDebtLink_debtAccountId_idx" ON "PropertyDebtLink"("debtAccountId");

-- AddForeignKey
ALTER TABLE "AccountPositionSnapshot"
ADD CONSTRAINT "AccountPositionSnapshot_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDebtLink"
ADD CONSTRAINT "PropertyDebtLink_propertyAccountId_fkey"
FOREIGN KEY ("propertyAccountId") REFERENCES "FinancialAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDebtLink"
ADD CONSTRAINT "PropertyDebtLink_debtAccountId_fkey"
FOREIGN KEY ("debtAccountId") REFERENCES "FinancialAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
