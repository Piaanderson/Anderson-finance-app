import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: {
    userId: "",
    householdId: "",
    role: "OWNER" as const
  }
}));

vi.mock("@/server/households", () => ({
  requireApiHousehold: vi.fn(async () => mocks.owner)
}));

import { DELETE as untieTransfer } from "@/app/api/transfers/[matchId]/route";
import { POST as tieTransfer } from "@/app/api/transfers/route";
import { getHouseholdTransferSuggestions } from "@/features/transactions/transfer-suggestion-data";
import { prisma } from "@/server/db";

const key = `transfer-review-${randomUUID()}`;
const ids = {
  userA: `${key}-user-a`,
  userB: `${key}-user-b`,
  householdA: `${key}-household-a`,
  householdB: `${key}-household-b`,
  itemA: `${key}-item-a`,
  itemB: `${key}-item-b`,
  accountA1: `${key}-account-a-1`,
  accountA2: `${key}-account-a-2`,
  accountA3: `${key}-account-a-3`,
  accountB1: `${key}-account-b-1`,
  accountB2: `${key}-account-b-2`,
  tieOut: `${key}-tie-out`,
  tieIn: `${key}-tie-in`,
  raceOut: `${key}-race-out`,
  raceIn: `${key}-race-in`,
  removedOut: `${key}-removed-out`,
  removedIn: `${key}-removed-in`,
  orphanReplacementOut: `${key}-orphan-replacement-out`,
  orphanMatch: `${key}-orphan-match`,
  pendingOut: `${key}-pending-out`,
  pendingIn: `${key}-pending-in`,
  currencyOut: `${key}-currency-out`,
  currencyIn: `${key}-currency-in`,
  dateOut: `${key}-date-out`,
  dateIn: `${key}-date-in`,
  signOut: `${key}-sign-out`,
  signIn: `${key}-sign-in`,
  sameAccountOut: `${key}-same-account-out`,
  sameAccountIn: `${key}-same-account-in`,
  foreignOut: `${key}-foreign-out`,
  foreignIn: `${key}-foreign-in`
};

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://currents.test/api/transfers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function tieRequest(
  outgoingTransactionId: string,
  incomingTransactionId: string
) {
  return tieTransfer(
    jsonRequest({ outgoingTransactionId, incomingTransactionId })
  );
}

function deleteRequest(matchId: string) {
  return untieTransfer(
    new Request(`http://currents.test/api/transfers/${matchId}`, {
      method: "DELETE"
    }),
    { params: Promise.resolve({ matchId }) }
  );
}

async function createFixtures() {
  await prisma.user.createMany({
    data: [
      { id: ids.userA, email: `${key}-a@example.test` },
      { id: ids.userB, email: `${key}-b@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.householdA, name: "Transfer review A" },
      { id: ids.householdB, name: "Transfer review B" }
    ]
  });
  await prisma.householdMember.createMany({
    data: [
      {
        id: `${key}-member-a`,
        householdId: ids.householdA,
        userId: ids.userA,
        role: "OWNER"
      },
      {
        id: `${key}-member-b`,
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
        plaidItemId: `${key}-plaid-a`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      },
      {
        id: ids.itemB,
        householdId: ids.householdB,
        linkedByUserId: ids.userB,
        plaidItemId: `${key}-plaid-b`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    ]
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.accountA1,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-account-a-1`,
        source: "PLAID",
        classification: "CASH",
        name: "A checking",
        type: "depository"
      },
      {
        id: ids.accountA2,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-account-a-2`,
        source: "PLAID",
        classification: "DEBT",
        name: "A card",
        type: "credit"
      },
      {
        id: ids.accountA3,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-account-a-3`,
        source: "PLAID",
        classification: "CASH",
        name: "A savings",
        type: "depository"
      },
      {
        id: ids.accountB1,
        householdId: ids.householdB,
        plaidItemId: ids.itemB,
        plaidAccountId: `${key}-plaid-account-b-1`,
        source: "PLAID",
        classification: "CASH",
        name: "B checking",
        type: "depository"
      },
      {
        id: ids.accountB2,
        householdId: ids.householdB,
        plaidItemId: ids.itemB,
        plaidAccountId: `${key}-plaid-account-b-2`,
        source: "PLAID",
        classification: "DEBT",
        name: "B card",
        type: "credit"
      }
    ]
  });
  const base = {
    householdId: ids.householdA,
    isoCurrencyCode: "USD",
    date: new Date("2026-09-10T00:00:00.000Z")
  };
  await prisma.transaction.createMany({
    data: [
      {
        ...base,
        id: ids.tieOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-tie-out`,
        name: "CARD PAYMENT",
        bankDescription: "ACH PAYMENT TO CARD",
        amount: "100.00",
        authorizedDate: new Date("2026-09-09T00:00:00.000Z")
      },
      {
        ...base,
        id: ids.tieIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-tie-in`,
        name: "PAYMENT RECEIVED",
        amount: "-100.00",
        date: new Date("2026-09-11T00:00:00.000Z")
      },
      {
        ...base,
        id: ids.raceOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-race-out`,
        name: "TRANSFER",
        amount: "200.00"
      },
      {
        ...base,
        id: ids.raceIn,
        accountId: ids.accountA3,
        plaidTransactionId: `${key}-plaid-race-in`,
        name: "TRANSFER RECEIVED",
        amount: "-200.00"
      },
      {
        ...base,
        id: ids.removedOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-removed-out`,
        name: "REMOVED TRANSFER",
        amount: "300.00",
        removedAt: new Date("2026-09-12T00:00:00.000Z")
      },
      {
        ...base,
        id: ids.removedIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-removed-in`,
        name: "REMOVED TRANSFER IN",
        amount: "-300.00"
      },
      {
        ...base,
        id: ids.orphanReplacementOut,
        accountId: ids.accountA3,
        plaidTransactionId: `${key}-plaid-orphan-replacement-out`,
        name: "REPLACEMENT TRANSFER",
        amount: "300.00"
      },
      {
        ...base,
        id: ids.pendingOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-pending-out`,
        name: "PENDING PAYMENT",
        amount: "400.00",
        pending: true
      },
      {
        ...base,
        id: ids.pendingIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-pending-in`,
        name: "PAYMENT RECEIVED",
        amount: "-400.00"
      },
      {
        ...base,
        id: ids.currencyOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-currency-out`,
        name: "USD TRANSFER",
        amount: "500.00"
      },
      {
        ...base,
        id: ids.currencyIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-currency-in`,
        name: "EUR TRANSFER",
        amount: "-500.00",
        isoCurrencyCode: "EUR"
      },
      {
        ...base,
        id: ids.dateOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-date-out`,
        name: "OLD TRANSFER",
        amount: "600.00",
        date: new Date("2026-09-01T00:00:00.000Z")
      },
      {
        ...base,
        id: ids.dateIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-date-in`,
        name: "LATE TRANSFER",
        amount: "-600.00",
        date: new Date("2026-09-09T00:00:00.000Z")
      },
      {
        ...base,
        id: ids.signOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-sign-out`,
        name: "OUT ONE",
        amount: "700.00"
      },
      {
        ...base,
        id: ids.signIn,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-sign-in`,
        name: "OUT TWO",
        amount: "700.00"
      },
      {
        ...base,
        id: ids.sameAccountOut,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-same-out`,
        name: "SAME ACCOUNT OUT",
        amount: "800.00"
      },
      {
        ...base,
        id: ids.sameAccountIn,
        accountId: ids.accountA1,
        plaidTransactionId: `${key}-plaid-same-in`,
        name: "SAME ACCOUNT IN",
        amount: "-800.00"
      },
      {
        id: ids.foreignOut,
        householdId: ids.householdB,
        accountId: ids.accountB1,
        plaidTransactionId: `${key}-plaid-foreign-out`,
        name: "FOREIGN PAYMENT",
        amount: "900.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-10T00:00:00.000Z")
      },
      {
        id: ids.foreignIn,
        householdId: ids.householdB,
        accountId: ids.accountB2,
        plaidTransactionId: `${key}-plaid-foreign-in`,
        name: "FOREIGN PAYMENT RECEIVED",
        amount: "-900.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-10T00:00:00.000Z")
      }
    ]
  });
  await prisma.transferMatch.create({
    data: {
      id: ids.orphanMatch,
      householdId: ids.householdA,
      outgoingTransactionId: ids.removedOut,
      incomingTransactionId: ids.removedIn
    }
  });
}

beforeAll(async () => {
  mocks.owner.userId = ids.userA;
  mocks.owner.householdId = ids.householdA;
  await createFixtures();
});

afterAll(async () => {
  await prisma.household.deleteMany({
    where: { id: { in: [ids.householdA, ids.householdB] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.userA, ids.userB] } }
  });
  await prisma.$disconnect();
});

describe("household transfer suggestions", () => {
  it("returns only eligible unmatched pairs from the requested household", async () => {
    const suggestions = await getHouseholdTransferSuggestions({
      householdId: ids.householdA
    });
    const serialized = JSON.stringify(suggestions);

    expect(
      suggestions.map((suggestion) => suggestion.outgoingTransactionId)
    ).toEqual(
      expect.arrayContaining([
        ids.tieOut,
        ids.raceOut,
        ids.orphanReplacementOut
      ])
    );
    expect(serialized).not.toContain(ids.foreignOut);
    expect(serialized).not.toContain(ids.removedOut);
    expect(serialized).not.toContain(ids.pendingOut);
    expect(serialized).not.toContain(ids.currencyOut);
    expect(serialized).not.toContain(ids.dateOut);
    expect(serialized).not.toContain(ids.sameAccountOut);
  });
});

describe("transfer tie and untie boundaries", () => {
  it("ties, rejects a duplicate, unties, and reties without changing source transactions", async () => {
    const before = await prisma.transaction.findMany({
      where: { id: { in: [ids.tieOut, ids.tieIn] } },
      orderBy: { id: "asc" }
    });
    const tied = await tieRequest(ids.tieOut, ids.tieIn);
    expect(tied.status).toBe(201);
    const { id: matchId } = (await tied.json()) as { id: string };

    const duplicate = await tieRequest(ids.tieOut, ids.tieIn);
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      code: "TRANSFER_MATCH_CONFLICT"
    });

    expect(
      await prisma.transaction.findMany({
        where: { id: { in: [ids.tieOut, ids.tieIn] } },
        orderBy: { id: "asc" }
      })
    ).toEqual(before);

    expect((await deleteRequest(matchId)).status).toBe(204);
    expect(
      await prisma.transaction.findMany({
        where: { id: { in: [ids.tieOut, ids.tieIn] } },
        orderBy: { id: "asc" }
      })
    ).toEqual(before);

    const retied = await tieRequest(ids.tieOut, ids.tieIn);
    expect(retied.status).toBe(201);
    const { id: retiedId } = (await retied.json()) as { id: string };
    expect((await deleteRequest(retiedId)).status).toBe(204);
  });

  it("returns one success and one stable conflict for racing ties", async () => {
    const responses = await Promise.all([
      tieRequest(ids.raceOut, ids.raceIn),
      tieRequest(ids.raceOut, ids.raceIn)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409
    ]);
    const conflict = responses.find((response) => response.status === 409)!;
    await expect(conflict.json()).resolves.toMatchObject({
      code: "TRANSFER_MATCH_CONFLICT"
    });
    const match = await prisma.transferMatch.findFirstOrThrow({
      where: {
        householdId: ids.householdA,
        outgoingTransactionId: ids.raceOut,
        incomingTransactionId: ids.raceIn
      }
    });
    expect((await deleteRequest(match.id)).status).toBe(204);
  });

  it("preserves 404 behavior for foreign transaction and match IDs", async () => {
    expect((await tieRequest(ids.tieOut, ids.foreignIn)).status).toBe(404);
    const foreignMatch = await prisma.transferMatch.create({
      data: {
        householdId: ids.householdB,
        outgoingTransactionId: ids.foreignOut,
        incomingTransactionId: ids.foreignIn
      }
    });
    expect((await deleteRequest(foreignMatch.id)).status).toBe(404);
  });

  it("reoffers a live leg whose prior match has a removed counterpart", async () => {
    const suggestions = await getHouseholdTransferSuggestions({
      householdId: ids.householdA
    });
    expect(
      suggestions
        .find(
          (suggestion) =>
            suggestion.outgoingTransactionId === ids.orphanReplacementOut
        )
        ?.candidates.map((candidate) => candidate.incoming.transactionId)
    ).toContain(ids.removedIn);

    const response = await tieRequest(ids.orphanReplacementOut, ids.removedIn);
    expect(response.status).toBe(201);
    await expect(
      prisma.transferMatch.findUnique({ where: { id: ids.orphanMatch } })
    ).resolves.toBeNull();
    const { id: replacementMatchId } = (await response.json()) as {
      id: string;
    };
    expect((await deleteRequest(replacementMatchId)).status).toBe(204);
  });

  it.each([
    ["removed rows", ids.removedOut, ids.removedIn],
    ["pending rows", ids.pendingOut, ids.pendingIn],
    ["incompatible currencies", ids.currencyOut, ids.currencyIn],
    ["dates outside the window", ids.dateOut, ids.dateIn],
    ["invalid signs", ids.signOut, ids.signIn],
    ["the same account", ids.sameAccountOut, ids.sameAccountIn]
  ])(
    "rejects %s without creating a match",
    async (_label, outgoing, incoming) => {
      const response = await tieRequest(outgoing, incoming);
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        code: "TRANSFER_NOT_ELIGIBLE"
      });
      expect(
        await prisma.transferMatch.findFirst({
          where: {
            householdId: ids.householdA,
            outgoingTransactionId: outgoing,
            incomingTransactionId: incoming
          }
        })
      ).toBeNull();
    }
  );
});
