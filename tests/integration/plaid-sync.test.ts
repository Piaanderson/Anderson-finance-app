import { randomUUID } from "node:crypto";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => ({
  accountsGet: vi.fn(),
  transactionsSync: vi.fn()
}));

vi.mock("@/server/plaid/client", () => ({
  plaid: {
    accountsGet: mocks.accountsGet,
    transactionsSync: mocks.transactionsSync
  }
}));

import { prisma } from "@/server/db";
import { syncPlaidItem } from "@/server/plaid/sync";
import { encryptSecret } from "@/server/secrets";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

function plaidAccount(
  accountId: string,
  name: string,
  current: number,
  available: number | null = current,
  type: "depository" | "investment" | "credit" | "loan" = "depository"
) {
  return {
    account_id: accountId,
    balances: {
      available,
      current,
      iso_currency_code: "USD",
      limit: null,
      unofficial_currency_code: null
    },
    mask: "1234",
    name,
    official_name: `${name} official`,
    type,
    subtype: type === "credit" ? "credit card" : "checking"
  } as AccountBase;
}

function plaidTransaction({
  transactionId,
  accountId,
  name,
  merchantName = null,
  amount = 10
}: {
  transactionId: string;
  accountId: string;
  name: string;
  merchantName?: string | null;
  amount?: number;
}) {
  return {
    transaction_id: transactionId,
    account_id: accountId,
    pending_transaction_id: null,
    name,
    merchant_name: merchantName,
    amount,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-09-12",
    authorized_date: "2026-09-11",
    pending: false,
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_RESTAURANT",
      confidence_level: "VERY_HIGH"
    }
  } as PlaidTransaction;
}

function syncPage({
  added = [],
  modified = [],
  removed = [],
  nextCursor,
  hasMore
}: {
  added?: PlaidTransaction[];
  modified?: PlaidTransaction[];
  removed?: Array<{ transaction_id: string }>;
  nextCursor: string;
  hasMore: boolean;
}) {
  return {
    data: {
      added,
      modified,
      removed,
      next_cursor: nextCursor,
      has_more: hasMore,
      accounts: [],
      transactions_update_status: "HISTORICAL_UPDATE_COMPLETE",
      request_id: "fixture-request"
    }
  };
}

async function createFixture() {
  const key = `plaid-sync-${randomUUID()}`;
  const userId = `${key}-user`;
  const householdId = `${key}-household`;
  const itemId = `${key}-item`;
  const jobId = `${key}-job`;
  const accountId = `${key}-account`;
  const staleAccountId = `${key}-stale-account`;
  const plaidAccountId = `${key}-plaid-account`;
  const stalePlaidAccountId = `${key}-stale-plaid-account`;
  const manualCategoryId = `${key}-manual-category`;
  const ruleCategoryId = `${key}-rule-category`;
  const encrypted = encryptSecret("fixture-access-token");

  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  await prisma.user.create({
    data: { id: userId, email: `${key}@example.test` }
  });
  await prisma.household.create({
    data: { id: householdId, name: "Plaid sync fixture" }
  });
  await prisma.householdMember.create({
    data: {
      id: `${key}-membership`,
      householdId,
      userId,
      role: "OWNER"
    }
  });
  await prisma.plaidItem.create({
    data: {
      id: itemId,
      householdId,
      linkedByUserId: userId,
      plaidItemId: `${key}-plaid-item`,
      accessTokenCiphertext: encrypted.ciphertext,
      accessTokenIv: encrypted.iv,
      accessTokenTag: encrypted.tag,
      encryptionKeyVersion: encrypted.keyVersion,
      syncCursor: "cursor-0"
    }
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: accountId,
        householdId,
        plaidItemId: itemId,
        plaidAccountId,
        source: "PLAID",
        classification: "CASH",
        name: "Old account name",
        type: "depository",
        currentBalance: "1.00",
        availableBalance: "1.00"
      },
      {
        id: staleAccountId,
        householdId,
        plaidItemId: itemId,
        plaidAccountId: stalePlaidAccountId,
        source: "PLAID",
        classification: "CASH",
        name: "Stale account",
        type: "depository"
      }
    ]
  });
  await prisma.category.createMany({
    data: [
      {
        id: manualCategoryId,
        householdId,
        name: `${key} manual`,
        section: "Flex"
      },
      {
        id: ruleCategoryId,
        householdId,
        name: `${key} rule`,
        section: "Needs"
      }
    ]
  });
  await prisma.merchantRule.create({
    data: {
      id: `${key}-merchant-rule`,
      householdId,
      categoryId: ruleCategoryId,
      merchantKey: "ruled merchant"
    }
  });
  await prisma.syncJob.create({
    data: {
      id: jobId,
      plaidItemId: itemId,
      dedupeKey: `plaid-sync:${itemId}`,
      reason: "WEBHOOK",
      status: "RUNNING",
      attempts: 1,
      lockedAt: new Date()
    }
  });

  return {
    key,
    householdId,
    itemId,
    jobId,
    accountId,
    staleAccountId,
    plaidAccountId,
    manualCategoryId,
    ruleCategoryId
  };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
});

beforeEach(() => {
  mocks.accountsGet.mockReset();
  mocks.transactionsSync.mockReset();
});

afterEach(async () => {
  const households = createdHouseholds.splice(0);
  const users = createdUsers.splice(0);
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Plaid transaction synchronization", () => {
  it("commits multiple pages, account lifecycle changes, and added/modified/removed updates", async () => {
    const fixture = await createFixture();
    const newPlaidAccountId = `${fixture.key}-new-plaid-account`;
    const addedId = `${fixture.key}-added`;
    const manualId = `${fixture.key}-manual`;
    const ruledId = `${fixture.key}-ruled`;
    const removedId = `${fixture.key}-removed`;

    await prisma.transaction.createMany({
      data: [
        {
          id: `${fixture.key}-manual-row`,
          householdId: fixture.householdId,
          accountId: fixture.accountId,
          plaidTransactionId: manualId,
          name: "Original manual",
          amount: "20.00",
          date: new Date("2026-09-10T00:00:00.000Z"),
          categoryId: fixture.manualCategoryId
        },
        {
          id: `${fixture.key}-ruled-row`,
          householdId: fixture.householdId,
          accountId: fixture.accountId,
          plaidTransactionId: ruledId,
          name: "Original ruled",
          amount: "30.00",
          date: new Date("2026-09-10T00:00:00.000Z"),
          categoryId: fixture.manualCategoryId
        },
        {
          id: `${fixture.key}-removed-row`,
          householdId: fixture.householdId,
          accountId: fixture.accountId,
          plaidTransactionId: removedId,
          name: "To remove",
          amount: "40.00",
          date: new Date("2026-09-10T00:00:00.000Z")
        }
      ]
    });

    mocks.accountsGet.mockResolvedValue({
      data: {
        accounts: [
          plaidAccount(
            fixture.plaidAccountId,
            "Updated checking",
            123.45,
            98.76
          ),
          plaidAccount(newPlaidAccountId, "New savings", 500)
        ]
      }
    });
    mocks.transactionsSync
      .mockResolvedValueOnce(
        syncPage({
          added: [
            plaidTransaction({
              transactionId: addedId,
              accountId: fixture.plaidAccountId,
              name: "New transaction",
              amount: 12.34
            })
          ],
          modified: [
            plaidTransaction({
              transactionId: manualId,
              accountId: fixture.plaidAccountId,
              name: "Updated manual",
              merchantName: "No Rule Merchant",
              amount: 21
            })
          ],
          nextCursor: "cursor-1",
          hasMore: true
        })
      )
      .mockResolvedValueOnce(
        syncPage({
          modified: [
            plaidTransaction({
              transactionId: ruledId,
              accountId: fixture.plaidAccountId,
              name: "Updated ruled",
              merchantName: "Ruled Merchant",
              amount: 31
            })
          ],
          removed: [{ transaction_id: removedId }],
          nextCursor: "cursor-2",
          hasMore: false
        })
      );

    await expect(syncPlaidItem(fixture.itemId, fixture.jobId)).resolves.toEqual(
      {
        accounts: 2,
        added: 1,
        modified: 2,
        removed: 1
      }
    );

    expect(mocks.accountsGet).toHaveBeenCalledWith({
      access_token: "fixture-access-token"
    });
    expect(
      mocks.transactionsSync.mock.calls.map(([request]) => request)
    ).toEqual([
      {
        access_token: "fixture-access-token",
        cursor: "cursor-0",
        count: 100
      },
      {
        access_token: "fixture-access-token",
        cursor: "cursor-1",
        count: 100
      }
    ]);
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { plaidAccountId: fixture.plaidAccountId }
      })
    ).resolves.toMatchObject({
      name: "Updated checking",
      isActive: true
    });
    const updatedAccount = await prisma.financialAccount.findUniqueOrThrow({
      where: { plaidAccountId: fixture.plaidAccountId }
    });
    expect(updatedAccount.currentBalance?.toString()).toBe("123.45");
    expect(updatedAccount.availableBalance?.toString()).toBe("98.76");
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { id: fixture.staleAccountId }
      })
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      prisma.financialAccount.findUnique({
        where: { plaidAccountId: newPlaidAccountId }
      })
    ).resolves.toMatchObject({
      householdId: fixture.householdId,
      source: "PLAID",
      classification: "CASH",
      isActive: true
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { plaidTransactionId: manualId }
      })
    ).resolves.toMatchObject({
      name: "Updated manual",
      categoryId: fixture.manualCategoryId,
      removedAt: null
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({
        where: { plaidTransactionId: ruledId }
      })
    ).resolves.toMatchObject({
      categoryId: fixture.ruleCategoryId,
      removedAt: null
    });
    const removed = await prisma.transaction.findUniqueOrThrow({
      where: { plaidTransactionId: removedId }
    });
    expect(removed.removedAt).toBeInstanceOf(Date);
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({
      syncCursor: "cursor-2",
      status: "ACTIVE",
      errorCode: null
    });
    await expect(
      prisma.syncJob.findUniqueOrThrow({ where: { id: fixture.jobId } })
    ).resolves.toMatchObject({
      paginationStartCursor: null,
      paginationCursor: null
    });
  });

  it("stores Plaid liabilities as signed debt positions", async () => {
    const fixture = await createFixture();
    mocks.accountsGet.mockResolvedValue({
      data: {
        accounts: [
          plaidAccount(
            fixture.plaidAccountId,
            "Credit card",
            400,
            600,
            "credit"
          )
        ]
      }
    });
    mocks.transactionsSync.mockResolvedValue(
      syncPage({ nextCursor: "cursor-1", hasMore: false })
    );

    await syncPlaidItem(fixture.itemId, fixture.jobId);

    const account = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: fixture.accountId }
    });
    expect(account).toMatchObject({
      source: "PLAID",
      classification: "DEBT",
      type: "credit"
    });
    expect(account.currentBalance?.toString()).toBe("-400");
    expect(account.availableBalance?.toString()).toBe("600");
  });

  it("atomically checkpoints a committed page and safely resumes after interruption", async () => {
    const fixture = await createFixture();
    const addedId = `${fixture.key}-checkpointed`;
    mocks.accountsGet.mockResolvedValue({
      data: {
        accounts: [plaidAccount(fixture.plaidAccountId, "Checking", 100)]
      }
    });
    mocks.transactionsSync
      .mockResolvedValueOnce(
        syncPage({
          added: [
            plaidTransaction({
              transactionId: addedId,
              accountId: fixture.plaidAccountId,
              name: "Checkpointed transaction"
            })
          ],
          nextCursor: "cursor-1",
          hasMore: true
        })
      )
      .mockRejectedValueOnce(new Error("simulated interruption"));

    await expect(syncPlaidItem(fixture.itemId, fixture.jobId)).rejects.toThrow(
      "simulated interruption"
    );
    await expect(
      prisma.transaction.findUnique({
        where: { plaidTransactionId: addedId }
      })
    ).resolves.not.toBeNull();
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({ syncCursor: "cursor-0", lastSyncedAt: null });
    await expect(
      prisma.syncJob.findUniqueOrThrow({ where: { id: fixture.jobId } })
    ).resolves.toMatchObject({
      paginationStartCursor: "cursor-0",
      paginationCursor: "cursor-1"
    });

    mocks.transactionsSync.mockReset();
    mocks.transactionsSync.mockResolvedValueOnce(
      syncPage({
        nextCursor: "cursor-2",
        hasMore: false
      })
    );
    await syncPlaidItem(fixture.itemId, fixture.jobId);

    expect(mocks.transactionsSync).toHaveBeenCalledWith({
      access_token: "fixture-access-token",
      cursor: "cursor-1",
      count: 100
    });
    await expect(
      prisma.transaction.count({ where: { plaidTransactionId: addedId } })
    ).resolves.toBe(1);
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({ syncCursor: "cursor-2" });
  });

  it("restarts from the original cursor after a pagination mutation", async () => {
    const fixture = await createFixture();
    const addedId = `${fixture.key}-mutation-replay`;
    const firstPage = syncPage({
      added: [
        plaidTransaction({
          transactionId: addedId,
          accountId: fixture.plaidAccountId,
          name: "Replay-safe transaction"
        })
      ],
      nextCursor: "cursor-1",
      hasMore: true
    });
    mocks.accountsGet.mockResolvedValue({
      data: {
        accounts: [plaidAccount(fixture.plaidAccountId, "Checking", 100)]
      }
    });
    mocks.transactionsSync
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce({
        response: {
          data: {
            error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
            access_token: "must-not-be-used"
          }
        }
      })
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(
        syncPage({
          nextCursor: "cursor-2",
          hasMore: false
        })
      );

    await expect(
      syncPlaidItem(fixture.itemId, fixture.jobId)
    ).resolves.toMatchObject({ added: 1 });

    expect(
      mocks.transactionsSync.mock.calls.map(([request]) => request.cursor)
    ).toEqual(["cursor-0", "cursor-1", "cursor-0", "cursor-1"]);
    await expect(
      prisma.transaction.count({ where: { plaidTransactionId: addedId } })
    ).resolves.toBe(1);
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({ syncCursor: "cursor-2" });
  });
});
