-- Retain the useful, normalized transaction fields needed to explain a bank
-- movement without storing Plaid's raw response payload.
ALTER TABLE "Transaction"
ADD COLUMN "bankDescription" TEXT,
ADD COLUMN "paymentMemo" TEXT,
ADD COLUMN "referenceNumber" TEXT,
ADD COLUMN "paymentChannel" TEXT,
ADD COLUMN "transactionCode" TEXT,
ADD COLUMN "checkNumber" TEXT,
ADD COLUMN "unofficialCurrencyCode" TEXT;

-- A match and both of its legs must belong to the same household. Existing
-- application checks remain, while these composite keys make the invariant
-- durable for every database writer.
ALTER TABLE "TransferMatch"
DROP CONSTRAINT "TransferMatch_outgoingTransactionId_fkey",
DROP CONSTRAINT "TransferMatch_incomingTransactionId_fkey";

CREATE UNIQUE INDEX "Transaction_id_householdId_key"
ON "Transaction"("id", "householdId");

CREATE UNIQUE INDEX "TransferMatch_outgoingTransactionId_householdId_key"
ON "TransferMatch"("outgoingTransactionId", "householdId");

CREATE UNIQUE INDEX "TransferMatch_incomingTransactionId_householdId_key"
ON "TransferMatch"("incomingTransactionId", "householdId");

ALTER TABLE "TransferMatch"
ADD CONSTRAINT "TransferMatch_outgoingTransactionId_householdId_fkey"
FOREIGN KEY ("outgoingTransactionId", "householdId")
REFERENCES "Transaction"("id", "householdId")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "TransferMatch_incomingTransactionId_householdId_fkey"
FOREIGN KEY ("incomingTransactionId", "householdId")
REFERENCES "Transaction"("id", "householdId")
ON DELETE CASCADE ON UPDATE CASCADE;
