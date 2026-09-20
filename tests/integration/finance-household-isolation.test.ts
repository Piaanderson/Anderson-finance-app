import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => ({
  activeOwner: {
    userId: "",
    householdId: "",
    role: "OWNER" as const
  },
  itemPublicTokenExchange: vi.fn(),
  itemRemove: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/server/households", () => ({
  requireApiHousehold: vi.fn(async () => mocks.activeOwner),
  requireHousehold: vi.fn(async () => ({
    ...mocks.activeOwner,
    household: {
      id: mocks.activeOwner.householdId,
      name: "Isolation fixture"
    }
  }))
}));

vi.mock("@/server/plaid/client", () => ({
  plaid: {
    itemPublicTokenExchange: mocks.itemPublicTokenExchange,
    itemRemove: mocks.itemRemove
  }
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

import { PUT as updateAllocation } from "@/app/api/budget/allocations/[allocationId]/route";
import { POST as exchangePublicToken } from "@/app/api/plaid/exchange/route";
import {
  DELETE as disconnectPlaidItem,
  POST as syncPlaidItem
} from "@/app/api/plaid/items/[itemId]/route";
import { PUT as categorizeTransaction } from "@/app/api/transactions/[transactionId]/category/route";
import { DELETE as untieTransfer } from "@/app/api/transfers/[matchId]/route";
import { POST as tieTransfer } from "@/app/api/transfers/route";
import { createCategory } from "@/features/categories/actions";
import { prisma } from "@/server/db";

const fixtureKey = `isolation-${randomUUID()}`;
const ids = {
  userA: `${fixtureKey}-user-a`,
  userB: `${fixtureKey}-user-b`,
  householdA: `${fixtureKey}-household-a`,
  householdB: `${fixtureKey}-household-b`,
  itemA: `${fixtureKey}-item-a`,
  itemB: `${fixtureKey}-item-b`,
  plaidItemA: `${fixtureKey}-plaid-a`,
  plaidItemB: `${fixtureKey}-plaid-b`,
  accountA: `${fixtureKey}-account-a`,
  accountB: `${fixtureKey}-account-b`,
  outgoingA: `${fixtureKey}-outgoing-a`,
  incomingA: `${fixtureKey}-incoming-a`,
  outgoingB: `${fixtureKey}-outgoing-b`,
  incomingB: `${fixtureKey}-incoming-b`,
  categoryA: `${fixtureKey}-category-a`,
  categoryB: `${fixtureKey}-category-b`,
  monthA: `${fixtureKey}-month-a`,
  monthB: `${fixtureKey}-month-b`,
  allocationA: `${fixtureKey}-allocation-a`,
  allocationB: `${fixtureKey}-allocation-b`,
  transferB: `${fixtureKey}-transfer-b`
};

const routeContext = <Key extends string>(key: Key, value: string) => ({
  params: Promise.resolve({ [key]: value } as Record<Key, string>)
});

function jsonRequest(method: string, body: Record<string, unknown>) {
  return new Request("http://currents.test/api/isolation", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function createFixtures() {
  await prisma.user.createMany({
    data: [
      { id: ids.userA, email: `${fixtureKey}-a@example.test` },
      { id: ids.userB, email: `${fixtureKey}-b@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.householdA, name: "Isolation household A" },
      { id: ids.householdB, name: "Isolation household B" }
    ]
  });
  await prisma.householdMember.createMany({
    data: [
      {
        id: `${fixtureKey}-membership-a`,
        householdId: ids.householdA,
        userId: ids.userA,
        role: "OWNER"
      },
      {
        id: `${fixtureKey}-membership-b`,
        householdId: ids.householdB,
        userId: ids.userB,
        role: "OWNER"
      }
    ]
  });
  await prisma.plaidItem.createMany({
    data: [
      {
        id: ids.itemA,
        householdId: ids.householdA,
        linkedByUserId: ids.userA,
        plaidItemId: ids.plaidItemA,
        accessTokenCiphertext: "fixture-a",
        accessTokenIv: "fixture-a",
        accessTokenTag: "fixture-a"
      },
      {
        id: ids.itemB,
        householdId: ids.householdB,
        linkedByUserId: ids.userB,
        plaidItemId: ids.plaidItemB,
        accessTokenCiphertext: "fixture-b",
        accessTokenIv: "fixture-b",
        accessTokenTag: "fixture-b"
      }
    ]
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.accountA,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${fixtureKey}-plaid-account-a`,
        name: "Household A checking",
        type: "depository"
      },
      {
        id: ids.accountB,
        householdId: ids.householdB,
        plaidItemId: ids.itemB,
        plaidAccountId: `${fixtureKey}-plaid-account-b`,
        name: "Household B checking",
        type: "depository"
      }
    ]
  });
  await prisma.transaction.createMany({
    data: [
      {
        id: ids.outgoingA,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${fixtureKey}-outgoing-plaid-a`,
        name: "Transfer out A",
        merchantName: "Merchant A",
        amount: "125.00",
        date: new Date("2026-09-08T12:00:00.000Z")
      },
      {
        id: ids.incomingA,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${fixtureKey}-incoming-plaid-a`,
        name: "Transfer in A",
        amount: "-125.00",
        date: new Date("2026-09-09T12:00:00.000Z")
      },
      {
        id: ids.outgoingB,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${fixtureKey}-outgoing-plaid-b`,
        name: "Transfer out B",
        merchantName: "Merchant B",
        amount: "125.00",
        date: new Date("2026-09-08T12:00:00.000Z")
      },
      {
        id: ids.incomingB,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${fixtureKey}-incoming-plaid-b`,
        name: "Transfer in B",
        amount: "-125.00",
        date: new Date("2026-09-09T12:00:00.000Z")
      }
    ]
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.categoryA,
        householdId: ids.householdA,
        name: `${fixtureKey} category A`,
        section: "Needs"
      },
      {
        id: ids.categoryB,
        householdId: ids.householdB,
        name: `${fixtureKey} category B`,
        section: "Needs"
      }
    ]
  });
  await prisma.budgetMonth.createMany({
    data: [
      {
        id: ids.monthA,
        householdId: ids.householdA,
        month: new Date("2026-09-01T00:00:00.000Z"),
        income: "8240.00"
      },
      {
        id: ids.monthB,
        householdId: ids.householdB,
        month: new Date("2026-09-01T00:00:00.000Z"),
        income: "8240.00"
      }
    ]
  });
  await prisma.budgetAllocation.createMany({
    data: [
      {
        id: ids.allocationA,
        budgetMonthId: ids.monthA,
        categoryId: ids.categoryA,
        planned: "500.00",
        destinationAccountId: ids.accountA
      },
      {
        id: ids.allocationB,
        budgetMonthId: ids.monthB,
        categoryId: ids.categoryB,
        planned: "600.00",
        destinationAccountId: ids.accountB
      }
    ]
  });
  await prisma.transferMatch.create({
    data: {
      id: ids.transferB,
      householdId: ids.householdB,
      outgoingTransactionId: ids.outgoingB,
      incomingTransactionId: ids.incomingB
    }
  });
}

async function removeFixtures() {
  await prisma.household.deleteMany({
    where: { id: { in: [ids.householdA, ids.householdB] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.userA, ids.userB] } }
  });
}

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
  mocks.activeOwner.userId = ids.userA;
  mocks.activeOwner.householdId = ids.householdA;
  await createFixtures();
});

beforeEach(() => {
  mocks.itemPublicTokenExchange.mockReset();
  mocks.itemRemove.mockReset();
  mocks.revalidatePath.mockReset();
});

afterAll(async () => {
  await removeFixtures();
  await prisma.$disconnect();
});

describe("Plaid mutation isolation", () => {
  it("derives ownership for a new public-token exchange and ignores a spoofed household", async () => {
    const plaidItemId = `${fixtureKey}-new-plaid-item`;
    mocks.itemPublicTokenExchange.mockResolvedValue({
      data: {
        item_id: plaidItemId,
        access_token: "mock-access-token"
      }
    });

    const response = await exchangePublicToken(
      jsonRequest("POST", {
        publicToken: "mock-public-token",
        institutionName: "Fixture bank",
        householdId: ids.householdB
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.itemPublicTokenExchange).toHaveBeenCalledOnce();
    const item = await prisma.plaidItem.findUniqueOrThrow({
      where: { plaidItemId }
    });
    expect(item.householdId).toBe(ids.householdA);
    expect(item.linkedByUserId).toBe(ids.userA);
    await expect(
      prisma.syncJob.findUnique({
        where: { dedupeKey: `plaid-sync:${item.id}` }
      })
    ).resolves.toMatchObject({
      plaidItemId: item.id,
      reason: "INITIAL",
      status: "PENDING"
    });
  });

  it("rejects an existing Item owned by another household without changing or syncing it", async () => {
    const before = await prisma.plaidItem.findUniqueOrThrow({
      where: { id: ids.itemB }
    });
    mocks.itemPublicTokenExchange.mockResolvedValue({
      data: {
        item_id: ids.plaidItemB,
        access_token: "replacement-must-not-be-stored"
      }
    });

    const response = await exchangePublicToken(
      jsonRequest("POST", { publicToken: "mock-foreign-public-token" })
    );

    expect(response.status).toBe(403);
    expect(mocks.itemPublicTokenExchange).toHaveBeenCalledOnce();
    expect(mocks.itemRemove).not.toHaveBeenCalled();
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: ids.itemB } })
    ).resolves.toEqual(before);
    await expect(
      prisma.syncJob.findUnique({
        where: { dedupeKey: `plaid-sync:${ids.itemB}` }
      })
    ).resolves.toBeNull();
  });

  it("returns 404 for a foreign manual-sync ID before enqueuing work", async () => {
    const response = await syncPlaidItem(
      new Request("http://currents.test/api/plaid/items", { method: "POST" }),
      routeContext("itemId", ids.itemB)
    );

    expect(response.status).toBe(404);
    expect(mocks.itemPublicTokenExchange).not.toHaveBeenCalled();
    expect(mocks.itemRemove).not.toHaveBeenCalled();
    await expect(
      prisma.syncJob.findUnique({
        where: { dedupeKey: `plaid-sync:${ids.itemB}` }
      })
    ).resolves.toBeNull();
  });

  it("returns 404 for a foreign disconnect ID before calling Plaid or mutating accounts", async () => {
    const response = await disconnectPlaidItem(
      new Request("http://currents.test/api/plaid/items", {
        method: "DELETE"
      }),
      routeContext("itemId", ids.itemB)
    );

    expect(response.status).toBe(404);
    expect(mocks.itemPublicTokenExchange).not.toHaveBeenCalled();
    expect(mocks.itemRemove).not.toHaveBeenCalled();
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: ids.itemB } })
    ).resolves.toMatchObject({
      status: "ACTIVE",
      accessTokenCiphertext: "fixture-b"
    });
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { id: ids.accountB }
      })
    ).resolves.toMatchObject({ isActive: true });
  });
});

describe("transfer mutation isolation", () => {
  it("does not tie a transaction to a foreign household leg", async () => {
    const response = await tieTransfer(
      jsonRequest("POST", {
        outgoingTransactionId: ids.outgoingA,
        incomingTransactionId: ids.incomingB
      })
    );

    expect(response.status).toBe(404);
    await expect(
      prisma.transferMatch.findFirst({
        where: {
          outgoingTransactionId: ids.outgoingA,
          incomingTransactionId: ids.incomingB
        }
      })
    ).resolves.toBeNull();
  });

  it("does not reveal or untie a foreign household match", async () => {
    const response = await untieTransfer(
      new Request("http://currents.test/api/transfers", { method: "DELETE" }),
      routeContext("matchId", ids.transferB)
    );

    expect(response.status).toBe(404);
    await expect(
      prisma.transferMatch.findUnique({ where: { id: ids.transferB } })
    ).resolves.not.toBeNull();
  });
});

describe("transaction category mutation isolation", () => {
  it("does not categorize an owned transaction with a foreign category or create a rule", async () => {
    const response = await categorizeTransaction(
      jsonRequest("PUT", {
        categoryId: ids.categoryB,
        createRule: true
      }),
      routeContext("transactionId", ids.outgoingA)
    );

    expect(response.status).toBe(404);
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: ids.outgoingA } })
    ).resolves.toMatchObject({ categoryId: null });
    await expect(
      prisma.merchantRule.findFirst({
        where: { merchantKey: "merchant a" }
      })
    ).resolves.toBeNull();
  });

  it("does not categorize a foreign transaction or create a merchant rule", async () => {
    const response = await categorizeTransaction(
      jsonRequest("PUT", {
        categoryId: ids.categoryA,
        createRule: true
      }),
      routeContext("transactionId", ids.outgoingB)
    );

    expect(response.status).toBe(404);
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: ids.outgoingB } })
    ).resolves.toMatchObject({ categoryId: null });
    await expect(
      prisma.merchantRule.findFirst({
        where: { merchantKey: "merchant b" }
      })
    ).resolves.toBeNull();
  });
});

describe("budget mutation isolation", () => {
  it("does not update a foreign household allocation", async () => {
    const response = await updateAllocation(
      jsonRequest("PUT", {
        planned: 999,
        destinationAccountId: ids.accountA
      }),
      routeContext("allocationId", ids.allocationB)
    );

    expect(response.status).toBe(404);
    await expect(
      prisma.budgetAllocation.findUniqueOrThrow({
        where: { id: ids.allocationB }
      })
    ).resolves.toMatchObject({
      destinationAccountId: ids.accountB
    });
    const allocation = await prisma.budgetAllocation.findUniqueOrThrow({
      where: { id: ids.allocationB }
    });
    expect(allocation.planned.toString()).toBe("600");
  });

  it("does not assign a foreign household destination account", async () => {
    const response = await updateAllocation(
      jsonRequest("PUT", {
        planned: 999,
        destinationAccountId: ids.accountB
      }),
      routeContext("allocationId", ids.allocationA)
    );

    expect(response.status).toBe(404);
    const allocation = await prisma.budgetAllocation.findUniqueOrThrow({
      where: { id: ids.allocationA }
    });
    expect(allocation.planned.toString()).toBe("500");
    expect(allocation.destinationAccountId).toBe(ids.accountA);
  });
});

describe("finance Server Action isolation", () => {
  it("creates a category only in the authenticated household and ignores a spoofed household", async () => {
    const formData = new FormData();
    const categoryName = `Action category ${fixtureKey.slice(-12)}`;
    formData.set("name", categoryName);
    formData.set("section", "Flex");
    formData.set("householdId", ids.householdB);

    const result = await createCategory({}, formData);

    expect(result).toEqual({ success: `${categoryName} was added.` });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/categories");
    const category = await prisma.category.findFirstOrThrow({
      where: { name: categoryName }
    });
    expect(category.householdId).toBe(ids.householdA);
  });
});

const coveredBoundaries = new Set([
  "POST src/app/api/plaid/exchange/route.ts",
  "POST src/app/api/plaid/items/[itemId]/route.ts",
  "DELETE src/app/api/plaid/items/[itemId]/route.ts",
  "POST src/app/api/transfers/route.ts",
  "DELETE src/app/api/transfers/[matchId]/route.ts",
  "PUT src/app/api/transactions/[transactionId]/category/route.ts",
  "PUT src/app/api/budget/allocations/[allocationId]/route.ts",
  "ACTION src/features/categories/actions.ts#createCategory"
]);

const classifiedNonIsolationBoundaries = new Map([
  [
    "POST src/app/api/plaid/link-token/route.ts",
    "Creates a short-lived Plaid Link token but does not mutate finance records."
  ],
  [
    "POST src/app/api/plaid/webhook/route.ts",
    "External signed callback with no authenticated household; issue #4 owns it."
  ]
]);

async function filesNamed(directory: string, name: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesNamed(entryPath, name);
      return entry.name === name ? [entryPath] : [];
    })
  );
  return files.flat();
}

async function discoverFinanceMutationBoundaries(root: string) {
  const apiRoot = path.join(root, "src/app/api");
  const financeApiGroups = ["plaid", "transfers", "transactions", "budget"];
  const routeFiles = (
    await Promise.all(
      financeApiGroups.map((group) =>
        filesNamed(path.join(apiRoot, group), "route.ts")
      )
    )
  ).flat();
  const actionFiles = await filesNamed(
    path.join(root, "src/features"),
    "actions.ts"
  );
  const boundaries: string[] = [];

  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    const relativePath = path.relative(root, file);
    for (const match of source.matchAll(
      /export async function (POST|PUT|PATCH|DELETE)\s*\(/g
    )) {
      boundaries.push(`${match[1]} ${relativePath}`);
    }
  }

  for (const file of actionFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes('"use server"') && !source.includes("'use server'")) {
      continue;
    }
    const relativePath = path.relative(root, file);
    for (const match of source.matchAll(/export async function (\w+)\s*\(/g)) {
      boundaries.push(`ACTION ${relativePath}#${match[1]}`);
    }
  }

  return boundaries.sort();
}

function unclassifiedBoundaries(
  discovered: string[],
  covered = coveredBoundaries,
  classified = classifiedNonIsolationBoundaries
) {
  return discovered.filter(
    (boundary) => !covered.has(boundary) && !classified.has(boundary)
  );
}

describe("finance mutation isolation coverage guard", () => {
  it("classifies every current finance mutation boundary", async () => {
    const discovered = await discoverFinanceMutationBoundaries(process.cwd());

    expect(unclassifiedBoundaries(discovered)).toEqual([]);
    expect(discovered).toEqual(
      [...coveredBoundaries, ...classifiedNonIsolationBoundaries.keys()].sort()
    );
  });

  it("fails when a newly discovered route is omitted from isolation coverage", () => {
    const omitted = "DELETE src/app/api/accounts/[accountId]/route.ts";
    const discovered = [...coveredBoundaries, omitted];

    expect(unclassifiedBoundaries(discovered)).toEqual([omitted]);
  });
});
