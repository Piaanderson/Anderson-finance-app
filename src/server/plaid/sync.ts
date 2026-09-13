import type {
  AccountBase,
  RemovedTransaction,
  Transaction as PlaidTransaction
} from "plaid";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/secrets";
import { plaid } from "./client";

function utcDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function upsertAccounts(
  plaidItem: {
    id: string;
    householdId: string;
  },
  accounts: AccountBase[]
) {
  const activeIds = accounts.map((account) => account.account_id);
  await prisma.$transaction([
    ...accounts.map((account) =>
      prisma.financialAccount.upsert({
        where: { plaidAccountId: account.account_id },
        update: {
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
        },
        create: {
          householdId: plaidItem.householdId,
          plaidItemId: plaidItem.id,
          plaidAccountId: account.account_id,
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: String(account.type),
          subtype: account.subtype ? String(account.subtype) : null,
          currentBalance: account.balances.current,
          availableBalance: account.balances.available,
          isoCurrencyCode:
            account.balances.iso_currency_code ??
            account.balances.unofficial_currency_code
        }
      })
    ),
    prisma.financialAccount.updateMany({
      where: {
        plaidItemId: plaidItem.id,
        plaidAccountId: { notIn: activeIds }
      },
      data: { isActive: false }
    })
  ]);
}

export async function syncPlaidItem(itemId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({
    where: { id: itemId }
  });
  const accessToken = decryptSecret({
    ciphertext: item.accessTokenCiphertext,
    iv: item.accessTokenIv,
    tag: item.accessTokenTag,
    keyVersion: item.encryptionKeyVersion
  });

  const accountResponse = await plaid.accountsGet({
    access_token: accessToken
  });
  await upsertAccounts(item, accountResponse.data.accounts);

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: RemovedTransaction[] = [];
  let cursor = item.syncCursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500
    });
    added.push(...response.data.added);
    modified.push(...response.data.modified);
    removed.push(...response.data.removed);
    cursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  const accountRows = await prisma.financialAccount.findMany({
    where: { plaidItemId: item.id },
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

  const upsertTransaction = (transaction: PlaidTransaction) => {
    const accountId = accountByPlaidId.get(transaction.account_id);
    if (!accountId) {
      throw new Error(
        `Plaid transaction references unknown account ${transaction.account_id}.`
      );
    }
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
      categoryId:
        categoryByMerchant.get(
          (transaction.merchant_name ?? transaction.name)
            .trim()
            .toLocaleLowerCase("en-US")
        ) ?? undefined,
      removedAt: null
    };
    return prisma.transaction.upsert({
      where: { plaidTransactionId: transaction.transaction_id },
      update: data,
      create: {
        plaidTransactionId: transaction.transaction_id,
        ...data
      }
    });
  };

  await prisma.$transaction([
    ...added.map(upsertTransaction),
    ...modified.map(upsertTransaction),
    ...removed.map((transaction) =>
      prisma.transaction.updateMany({
        where: {
          plaidTransactionId: transaction.transaction_id,
          householdId: item.householdId
        },
        data: { removedAt: new Date() }
      })
    ),
    prisma.plaidItem.update({
      where: { id: item.id },
      data: {
        syncCursor: cursor,
        lastSyncedAt: new Date(),
        status: "ACTIVE",
        errorCode: null
      }
    })
  ]);

  return {
    accounts: accountRows.length,
    added: added.length,
    modified: modified.length,
    removed: removed.length
  };
}
