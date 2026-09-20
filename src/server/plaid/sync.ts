import type {
  AccountBase,
  RemovedTransaction,
  Transaction as PlaidTransaction
} from "plaid";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/secrets";
import { plaid } from "./client";
import { plaidErrorCode } from "./errors";

const ACCOUNT_CHUNK_SIZE = 100;
const TRANSACTION_PAGE_SIZE = 100;
const MAX_PAGINATION_RESTARTS = 3;

function utcDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function assertActiveClaim(
  tx: Prisma.TransactionClient,
  plaidItem: { id: string; householdId: string },
  jobId: string
) {
  const [item, job] = await Promise.all([
    tx.plaidItem.findFirst({
      where: {
        id: plaidItem.id,
        householdId: plaidItem.householdId,
        status: { not: "REMOVED" }
      },
      select: { id: true }
    }),
    tx.syncJob.findFirst({
      where: {
        id: jobId,
        plaidItemId: plaidItem.id,
        status: "RUNNING"
      },
      select: { id: true }
    })
  ]);
  if (!item || !job) {
    throw new Error("Plaid sync job lost its active Item claim.");
  }
}

async function upsertAccounts(
  plaidItem: {
    id: string;
    householdId: string;
  },
  accounts: AccountBase[],
  jobId: string
) {
  const activeIds = accounts.map((account) => account.account_id);
  for (const accountChunk of chunks(accounts, ACCOUNT_CHUNK_SIZE)) {
    await prisma.$transaction(async (tx) => {
      await assertActiveClaim(tx, plaidItem, jobId);
      for (const account of accountChunk) {
        const existing = await tx.financialAccount.findUnique({
          where: { plaidAccountId: account.account_id },
          select: { id: true, householdId: true, plaidItemId: true }
        });
        if (
          existing &&
          (existing.householdId !== plaidItem.householdId ||
            existing.plaidItemId !== plaidItem.id)
        ) {
          throw new Error("Plaid account ownership mismatch.");
        }
        const data = {
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: String(account.type),
          subtype: account.subtype ? String(account.subtype) : null,
          currentBalance: account.balances.current,
          availableBalance: account.balances.available,
          isoCurrencyCode:
            account.balances.iso_currency_code ??
            account.balances.unofficial_currency_code,
          isActive: true
        };
        if (existing) {
          await tx.financialAccount.update({
            where: { id: existing.id },
            data
          });
        } else {
          await tx.financialAccount.create({
            data: {
              householdId: plaidItem.householdId,
              plaidItemId: plaidItem.id,
              plaidAccountId: account.account_id,
              ...data
            }
          });
        }
      }
    });
  }

  await prisma.$transaction(async (tx) => {
    await assertActiveClaim(tx, plaidItem, jobId);
    await tx.financialAccount.updateMany({
      where: {
        plaidItemId: plaidItem.id,
        householdId: plaidItem.householdId,
        plaidAccountId: { notIn: activeIds }
      },
      data: { isActive: false }
    });
  });
}

function merchantKey(transaction: PlaidTransaction) {
  return (transaction.merchant_name ?? transaction.name)
    .trim()
    .toLocaleLowerCase("en-US");
}

async function applyTransaction(
  tx: Prisma.TransactionClient,
  item: { id: string; householdId: string },
  accountByPlaidId: Map<string, string>,
  categoryByMerchant: Map<string, string>,
  transaction: PlaidTransaction
) {
  const accountId = accountByPlaidId.get(transaction.account_id);
  if (!accountId) {
    throw new Error("Plaid transaction references an unknown account.");
  }
  const existing = await tx.transaction.findUnique({
    where: { plaidTransactionId: transaction.transaction_id },
    select: { id: true, householdId: true }
  });
  if (existing && existing.householdId !== item.householdId) {
    throw new Error("Plaid transaction ownership mismatch.");
  }
  const ruleCategoryId = categoryByMerchant.get(merchantKey(transaction));
  const data = {
    householdId: item.householdId,
    accountId,
    pendingTransactionId: transaction.pending_transaction_id,
    name: transaction.name,
    merchantName: transaction.merchant_name,
    amount: transaction.amount,
    isoCurrencyCode:
      transaction.iso_currency_code ?? transaction.unofficial_currency_code,
    date: utcDate(transaction.date)!,
    authorizedDate: utcDate(transaction.authorized_date),
    pending: transaction.pending,
    categoryPrimary: transaction.personal_finance_category?.primary ?? null,
    categoryDetailed: transaction.personal_finance_category?.detailed ?? null,
    ...(ruleCategoryId ? { categoryId: ruleCategoryId } : {}),
    removedAt: null
  };

  if (existing) {
    await tx.transaction.update({ where: { id: existing.id }, data });
  } else {
    await tx.transaction.create({
      data: {
        plaidTransactionId: transaction.transaction_id,
        categoryId: ruleCategoryId ?? null,
        ...data
      }
    });
  }
}

async function commitPage({
  item,
  jobId,
  startCursor,
  nextCursor,
  hasMore,
  accountByPlaidId,
  categoryByMerchant,
  added,
  modified,
  removed
}: {
  item: { id: string; householdId: string };
  jobId: string;
  startCursor: string;
  nextCursor: string;
  hasMore: boolean;
  accountByPlaidId: Map<string, string>;
  categoryByMerchant: Map<string, string>;
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
}) {
  await prisma.$transaction(async (tx) => {
    for (const transaction of added) {
      await applyTransaction(
        tx,
        item,
        accountByPlaidId,
        categoryByMerchant,
        transaction
      );
    }
    for (const transaction of modified) {
      await applyTransaction(
        tx,
        item,
        accountByPlaidId,
        categoryByMerchant,
        transaction
      );
    }
    for (const transaction of removed) {
      await tx.transaction.updateMany({
        where: {
          plaidTransactionId: transaction.transaction_id,
          householdId: item.householdId
        },
        data: { removedAt: new Date() }
      });
    }

    const checkpoint = await tx.syncJob.updateMany({
      where: { id: jobId, plaidItemId: item.id, status: "RUNNING" },
      data: hasMore
        ? {
            paginationStartCursor: startCursor,
            paginationCursor: nextCursor,
            lockedAt: new Date()
          }
        : {
            paginationStartCursor: null,
            paginationCursor: null,
            lockedAt: new Date()
          }
    });
    if (checkpoint.count !== 1) {
      throw new Error("Plaid sync job lost its claim.");
    }

    if (!hasMore) {
      await tx.plaidItem.update({
        where: { id: item.id },
        data: {
          syncCursor: nextCursor,
          lastSyncedAt: new Date(),
          status: "ACTIVE",
          errorCode: null
        }
      });
    }
  });
}

export async function syncPlaidItem(itemId: string, jobId: string) {
  const [item, job] = await Promise.all([
    prisma.plaidItem.findUniqueOrThrow({ where: { id: itemId } }),
    prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } })
  ]);
  if (job.plaidItemId !== item.id || job.status !== "RUNNING") {
    throw new Error("Plaid sync job is not claimed for this Item.");
  }

  const accessToken = decryptSecret({
    ciphertext: item.accessTokenCiphertext,
    iv: item.accessTokenIv,
    tag: item.accessTokenTag,
    keyVersion: item.encryptionKeyVersion
  });

  const accountResponse = await plaid.accountsGet({
    access_token: accessToken
  });
  await upsertAccounts(item, accountResponse.data.accounts, jobId);

  const accountRows = await prisma.financialAccount.findMany({
    where: { plaidItemId: item.id, householdId: item.householdId },
    select: { id: true, plaidAccountId: true }
  });
  const accountByPlaidId = new Map(
    accountRows.map((account) => [account.plaidAccountId, account.id])
  );
  const rules = await prisma.merchantRule.findMany({
    where: { householdId: item.householdId },
    select: { merchantKey: true, categoryId: true }
  });
  const categoryByMerchant = new Map(
    rules.map((rule) => [rule.merchantKey, rule.categoryId])
  );

  const startCursor = job.paginationStartCursor ?? item.syncCursor ?? "";
  let cursor = job.paginationCursor ?? item.syncCursor ?? undefined;
  let paginationRestarts = 0;
  let totals = { added: 0, modified: 0, removed: 0 };

  while (true) {
    try {
      const response = await plaid.transactionsSync({
        access_token: accessToken,
        cursor,
        count: TRANSACTION_PAGE_SIZE
      });
      const page = response.data;
      await commitPage({
        item,
        jobId,
        startCursor,
        nextCursor: page.next_cursor,
        hasMore: page.has_more,
        accountByPlaidId,
        categoryByMerchant,
        added: page.added,
        modified: page.modified,
        removed: page.removed
      });
      totals = {
        added: totals.added + page.added.length,
        modified: totals.modified + page.modified.length,
        removed: totals.removed + page.removed.length
      };
      if (!page.has_more) break;
      cursor = page.next_cursor;
    } catch (error) {
      if (
        plaidErrorCode(error) !==
          "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" ||
        paginationRestarts >= MAX_PAGINATION_RESTARTS
      ) {
        throw error;
      }
      paginationRestarts += 1;
      totals = { added: 0, modified: 0, removed: 0 };
      cursor = startCursor || undefined;
      await prisma.syncJob.updateMany({
        where: { id: jobId, plaidItemId: item.id, status: "RUNNING" },
        data: {
          paginationStartCursor: startCursor,
          paginationCursor: startCursor,
          lockedAt: new Date()
        }
      });
    }
  }

  return {
    accounts: accountResponse.data.accounts.length,
    ...totals
  };
}
