-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlaidItemStatus" AS ENUM ('ACTIVE', 'LOGIN_REQUIRED', 'ERROR', 'REMOVED');

-- CreateEnum
CREATE TYPE "SyncReason" AS ENUM ('INITIAL', 'WEBHOOK', 'RECONCILIATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "accessTokenCiphertext" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "accessTokenTag" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "syncCursor" TEXT,
    "status" "PlaidItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "errorCode" TEXT,
    "consentExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currentBalance" DECIMAL(18,2),
    "availableBalance" DECIMAL(18,2),
    "isoCurrencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "pendingTransactionId" TEXT,
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "isoCurrencyCode" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedDate" TIMESTAMP(3),
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "categoryPrimary" TEXT,
    "categoryDetailed" TEXT,
    "categoryId" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMonth" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "income" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "budgetMonthId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "planned" DECIMAL(18,2) NOT NULL,
    "destinationAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferMatch" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "outgoingTransactionId" TEXT NOT NULL,
    "incomingTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "reason" "SyncReason" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_plaidItemId_key" ON "PlaidItem"("plaidItemId");

-- CreateIndex
CREATE INDEX "PlaidItem_householdId_idx" ON "PlaidItem"("householdId");

-- CreateIndex
CREATE INDEX "PlaidItem_status_idx" ON "PlaidItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_plaidAccountId_key" ON "FinancialAccount"("plaidAccountId");

-- CreateIndex
CREATE INDEX "FinancialAccount_householdId_type_idx" ON "FinancialAccount"("householdId", "type");

-- CreateIndex
CREATE INDEX "FinancialAccount_plaidItemId_idx" ON "FinancialAccount"("plaidItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_date_idx" ON "Transaction"("householdId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_pendingTransactionId_idx" ON "Transaction"("pendingTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Category_householdId_section_sortOrder_idx" ON "Category"("householdId", "section", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_householdId_name_key" ON "Category"("householdId", "name");

-- CreateIndex
CREATE INDEX "MerchantRule_categoryId_idx" ON "MerchantRule"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_householdId_merchantKey_key" ON "MerchantRule"("householdId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMonth_householdId_month_key" ON "BudgetMonth"("householdId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_budgetMonthId_categoryId_key" ON "BudgetAllocation"("budgetMonthId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferMatch_outgoingTransactionId_key" ON "TransferMatch"("outgoingTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferMatch_incomingTransactionId_key" ON "TransferMatch"("incomingTransactionId");

-- CreateIndex
CREATE INDEX "TransferMatch_householdId_idx" ON "TransferMatch"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJob_dedupeKey_key" ON "SyncJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "SyncJob_status_runAfter_idx" ON "SyncJob"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidItem" ADD CONSTRAINT "PlaidItem_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMonth" ADD CONSTRAINT "BudgetMonth_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_budgetMonthId_fkey" FOREIGN KEY ("budgetMonthId") REFERENCES "BudgetMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_outgoingTransactionId_fkey" FOREIGN KEY ("outgoingTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_incomingTransactionId_fkey" FOREIGN KEY ("incomingTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
