-- CreateEnum
CREATE TYPE "AccountSource" AS ENUM ('PLAID', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinancialAccountClassification" AS ENUM ('CASH', 'INVESTED', 'PROPERTY', 'DEBT', 'UNCLASSIFIED');

-- Add nullable columns so existing Plaid rows can be classified before the
-- required constraints are installed.
ALTER TABLE "FinancialAccount"
ADD COLUMN "classification" "FinancialAccountClassification",
ADD COLUMN "source" "AccountSource";

-- Every pre-existing account was created by Plaid. Preserve provider type and
-- identifiers while adding the product-facing classification.
UPDATE "FinancialAccount"
SET
  "source" = 'PLAID',
  "classification" = CASE LOWER("type")
    WHEN 'depository' THEN 'CASH'::"FinancialAccountClassification"
    WHEN 'investment' THEN 'INVESTED'::"FinancialAccountClassification"
    WHEN 'credit' THEN 'DEBT'::"FinancialAccountClassification"
    WHEN 'loan' THEN 'DEBT'::"FinancialAccountClassification"
    ELSE 'UNCLASSIFIED'::"FinancialAccountClassification"
  END;

-- Plaid reports liability current balances as amount owed. Currents stores one
-- signed position convention, so debts reduce net worth and overpayments are
-- positive positions. Asset signs are retained exactly, including overdrafts.
UPDATE "FinancialAccount"
SET "currentBalance" = -"currentBalance"
WHERE "classification" = 'DEBT' AND "currentBalance" IS NOT NULL;

ALTER TABLE "FinancialAccount"
ALTER COLUMN "classification" SET NOT NULL,
ALTER COLUMN "source" SET NOT NULL,
ALTER COLUMN "plaidItemId" DROP NOT NULL,
ALTER COLUMN "plaidAccountId" DROP NOT NULL,
ALTER COLUMN "type" DROP NOT NULL;

-- Provider identity is all-or-nothing. Manual accounts cannot accidentally
-- carry server-only Plaid identifiers, while Plaid accounts retain theirs.
ALTER TABLE "FinancialAccount"
ADD CONSTRAINT "FinancialAccount_source_identity_check" CHECK (
  (
    "source" = 'PLAID'
    AND "plaidItemId" IS NOT NULL
    AND "plaidAccountId" IS NOT NULL
    AND "type" IS NOT NULL
  )
  OR
  (
    "source" = 'MANUAL'
    AND "plaidItemId" IS NULL
    AND "plaidAccountId" IS NULL
  )
);

-- DropIndex
DROP INDEX "FinancialAccount_householdId_type_idx";

-- CreateIndex
CREATE INDEX "BudgetAllocation_destinationAccountId_idx" ON "BudgetAllocation"("destinationAccountId");

-- CreateIndex
CREATE INDEX "FinancialAccount_householdId_classification_idx" ON "FinancialAccount"("householdId", "classification");

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
