import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getHouseholdMovements } from "@/features/transactions/movement-data";
import { prisma } from "@/server/db";

const key = `movements-${randomUUID()}`;
const ids = {
  userA: `${key}-user-a`,
  userB: `${key}-user-b`,
  householdA: `${key}-household-a`,
  householdB: `${key}-household-b`,
  itemA: `${key}-item-a`,
  itemB: `${key}-item-b`,
  accountA: `${key}-account-a`,
  accountA2: `${key}-account-a-2`,
  inactiveA: `${key}-inactive-a`,
  accountB: `${key}-account-b`,
  outgoingA: `${key}-outgoing-a`,
  incomingA: `${key}-incoming-a`,
  pendingA: `${key}-pending-a`,
  removedA: `${key}-removed-a`,
  historicalA: `${key}-historical-a`,
  crossA: `${key}-cross-a`,
  outgoingB: `${key}-outgoing-b`,
  incomingB: `${key}-incoming-b`,
  crossB: `${key}-cross-b`,
  matchA: `${key}-match-a`,
  matchB: `${key}-match-b`
};

async function createFixtures() {
  await prisma.user.createMany({
    data: [
      { id: ids.userA, email: `${key}-a@example.test` },
      { id: ids.userB, email: `${key}-b@example.test` }
    ]
  });
  await prisma.household.createMany({
    data: [
      { id: ids.householdA, name: "Movement household A" },
      { id: ids.householdB, name: "Movement household B" }
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
        plaidItemId: `${key}-plaid-item-a`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      },
      {
        id: ids.itemB,
        householdId: ids.householdB,
        linkedByUserId: ids.userB,
        plaidItemId: `${key}-plaid-item-b`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    ]
  });
  await prisma.financialAccount.createMany({
    data: [
      {
        id: ids.accountA,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-account-a`,
        source: "PLAID",
        classification: "CASH",
        name: "A checking",
        mask: "1111",
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
        mask: "2222",
        type: "credit"
      },
      {
        id: ids.inactiveA,
        householdId: ids.householdA,
        plaidItemId: ids.itemA,
        plaidAccountId: `${key}-plaid-inactive-a`,
        source: "PLAID",
        classification: "CASH",
        name: "A disconnected savings",
        type: "depository",
        isActive: false
      },
      {
        id: ids.accountB,
        householdId: ids.householdB,
        plaidItemId: ids.itemB,
        plaidAccountId: `${key}-plaid-account-b`,
        source: "PLAID",
        classification: "CASH",
        name: "B checking",
        mask: "9999",
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
        plaidTransactionId: `${key}-plaid-outgoing-a`,
        name: "ONLINE PAYMENT",
        merchantName: "A card payment",
        bankDescription: "ACH PAYMENT CARD 2222",
        paymentMemo: "Monthly payment",
        referenceNumber: "REF-A",
        paymentChannel: "online",
        transactionCode: "transfer",
        amount: "400.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-09T00:00:00.000Z"),
        authorizedDate: new Date("2026-09-08T00:00:00.000Z")
      },
      {
        id: ids.incomingA,
        householdId: ids.householdA,
        accountId: ids.accountA2,
        plaidTransactionId: `${key}-plaid-incoming-a`,
        name: "PAYMENT RECEIVED",
        bankDescription: "THANK YOU PAYMENT",
        referenceNumber: "REF-B",
        amount: "-400.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-10T00:00:00.000Z")
      },
      {
        id: ids.pendingA,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-pending-a`,
        name: "Pending coffee",
        amount: "5.25",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-12T00:00:00.000Z"),
        pending: true
      },
      {
        id: ids.removedA,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-removed-a`,
        name: "Removed",
        amount: "99.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-12T00:00:00.000Z"),
        removedAt: new Date()
      },
      {
        id: ids.historicalA,
        householdId: ids.householdA,
        accountId: ids.inactiveA,
        plaidTransactionId: `${key}-plaid-historical-a`,
        name: "Historical transaction",
        amount: "10.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-07T00:00:00.000Z")
      },
      {
        id: ids.crossA,
        householdId: ids.householdA,
        accountId: ids.accountA,
        plaidTransactionId: `${key}-plaid-cross-a`,
        name: "Owned loose leg",
        amount: "20.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-06T00:00:00.000Z")
      },
      {
        id: ids.outgoingB,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${key}-plaid-outgoing-b`,
        name: "Foreign outgoing",
        amount: "300.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-09T00:00:00.000Z")
      },
      {
        id: ids.incomingB,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${key}-plaid-incoming-b`,
        name: "Foreign incoming",
        amount: "-300.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-10T00:00:00.000Z")
      },
      {
        id: ids.crossB,
        householdId: ids.householdB,
        accountId: ids.accountB,
        plaidTransactionId: `${key}-plaid-cross-b`,
        name: "Foreign loose leg",
        amount: "-20.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-06T00:00:00.000Z")
      }
    ]
  });
  await prisma.transferMatch.createMany({
    data: [
      {
        id: ids.matchA,
        householdId: ids.householdA,
        outgoingTransactionId: ids.outgoingA,
        incomingTransactionId: ids.incomingA
      },
      {
        id: ids.matchB,
        householdId: ids.householdB,
        outgoingTransactionId: ids.outgoingB,
        incomingTransactionId: ids.incomingB
      }
    ]
  });
}

beforeAll(createFixtures);

afterAll(async () => {
  await prisma.household.deleteMany({
    where: { id: { in: [ids.householdA, ids.householdB] } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.userA, ids.userB] } }
  });
  await prisma.$disconnect();
});

describe("household movement reads", () => {
  it("returns one transfer with both owned source legs and no foreign details", async () => {
    const movements = await getHouseholdMovements({
      householdId: ids.householdA
    });
    const transfer = movements.find((movement) => movement.kind === "TRANSFER");

    expect(transfer).toMatchObject({
      id: `transfer:${ids.outgoingA}:${ids.incomingA}`,
      canonicalDate: "2026-09-08T00:00:00.000Z",
      description: "A card payment",
      legs: [
        {
          transactionId: ids.outgoingA,
          bankDescription: "ACH PAYMENT CARD 2222",
          paymentMemo: "Monthly payment",
          referenceNumber: "REF-A",
          account: { name: "A checking" }
        },
        {
          transactionId: ids.incomingA,
          bankDescription: "THANK YOU PAYMENT",
          referenceNumber: "REF-B",
          account: { name: "A card" }
        }
      ]
    });
    const serialized = JSON.stringify(movements);
    expect(serialized).not.toContain(ids.outgoingB);
    expect(serialized).not.toContain(ids.incomingB);
    expect(serialized).not.toContain("Foreign");
    expect(serialized).not.toContain("B checking");
  });

  it("keeps pending and inactive-account history but excludes removed rows", async () => {
    const movements = await getHouseholdMovements({
      householdId: ids.householdA
    });

    expect(
      movements.find(
        (movement) => movement.id === `transaction:${ids.pendingA}`
      )
    ).toMatchObject({ pending: true });
    expect(
      movements.find(
        (movement) => movement.id === `transaction:${ids.historicalA}`
      )
    ).toMatchObject({ legs: [{ account: { active: false } }] });
    expect(
      movements.some(
        (movement) => movement.id === `transaction:${ids.removedA}`
      )
    ).toBe(false);
  });

  it("rejects a transfer match that combines households at the database boundary", async () => {
    await expect(
      prisma.transferMatch.create({
        data: {
          id: `${key}-invalid-cross-household`,
          householdId: ids.householdA,
          outgoingTransactionId: ids.crossA,
          incomingTransactionId: ids.crossB
        }
      })
    ).rejects.toThrow();

    const movements = await getHouseholdMovements({
      householdId: ids.householdA
    });
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `transaction:${ids.crossA}` })
      ])
    );
    expect(JSON.stringify(movements)).not.toContain(ids.crossB);
  });
});

describe("household movement migration", () => {
  it("preserves existing transactions and matches while adding normalized fields", async () => {
    const connectionString =
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/currents";
    const client = new Client({ connectionString });
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const priorMigrations = [
      "20260913170000_initial_foundation",
      "20260913172343_product_features",
      "20260916021500_passkey_authentication",
      "20260920013000_plaid_sync_checkpoints",
      "20260920023853_generalize_financial_accounts",
      "20260921210000_manual_accounts_and_snapshots"
    ];
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      for (const migration of priorMigrations) {
        const sql = await readFile(
          path.join(
            process.cwd(),
            "prisma",
            "migrations",
            migration,
            "migration.sql"
          ),
          "utf8"
        );
        await client.query(sql);
      }
      await client.query(`
        INSERT INTO "User" ("id", "email", "updatedAt")
        VALUES ('user', 'movement-migration@example.test', CURRENT_TIMESTAMP);
        INSERT INTO "Household" ("id", "name", "updatedAt")
        VALUES ('household', 'Movement migration', CURRENT_TIMESTAMP);
        INSERT INTO "PlaidItem" (
          "id", "householdId", "linkedByUserId", "plaidItemId",
          "accessTokenCiphertext", "accessTokenIv", "accessTokenTag", "updatedAt"
        ) VALUES (
          'item', 'household', 'user', 'provider-item',
          'cipher', 'iv', 'tag', CURRENT_TIMESTAMP
        );
        INSERT INTO "FinancialAccount" (
          "id", "householdId", "source", "classification", "plaidItemId",
          "plaidAccountId", "name", "type", "updatedAt"
        ) VALUES
          ('checking', 'household', 'PLAID', 'CASH', 'item', 'checking-provider', 'Checking', 'depository', CURRENT_TIMESTAMP),
          ('card', 'household', 'PLAID', 'DEBT', 'item', 'card-provider', 'Card', 'credit', CURRENT_TIMESTAMP);
        INSERT INTO "Transaction" (
          "id", "householdId", "accountId", "plaidTransactionId", "name",
          "amount", "date", "updatedAt"
        ) VALUES
          ('outgoing', 'household', 'checking', 'provider-out', 'Payment', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
          ('incoming', 'household', 'card', 'provider-in', 'Payment received', -50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "TransferMatch" (
          "id", "householdId", "outgoingTransactionId", "incomingTransactionId"
        ) VALUES ('match', 'household', 'outgoing', 'incoming');
      `);

      const migration = await readFile(
        path.join(
          process.cwd(),
          "prisma",
          "migrations",
          "20260921230000_household_movements",
          "migration.sql"
        ),
        "utf8"
      );
      await client.query(migration);

      const result = await client.query<{
        transactionCount: string;
        matchCount: string;
        normalizedNulls: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM "Transaction") AS "transactionCount",
          (SELECT COUNT(*) FROM "TransferMatch") AS "matchCount",
          (
            SELECT COUNT(*) FROM "Transaction"
            WHERE "bankDescription" IS NULL
              AND "paymentMemo" IS NULL
              AND "referenceNumber" IS NULL
          ) AS "normalizedNulls"
      `);
      expect(result.rows[0]).toEqual({
        transactionCount: "2",
        matchCount: "1",
        normalizedNulls: "2"
      });
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
