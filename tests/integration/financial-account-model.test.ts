import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getAccountOverview } from "@/features/accounts/data";
import { prisma } from "@/server/db";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

async function createHouseholdFixture() {
  const key = `account-model-${randomUUID()}`;
  const userId = `${key}-user`;
  const householdId = `${key}-household`;
  createdUsers.push(userId);
  createdHouseholds.push(householdId);

  await prisma.user.create({
    data: { id: userId, email: `${key}@example.test` }
  });
  await prisma.household.create({
    data: { id: householdId, name: "Account model fixture" }
  });
  await prisma.householdMember.create({
    data: {
      id: `${key}-membership`,
      householdId,
      userId,
      role: "OWNER"
    }
  });

  return { key, householdId, userId };
}

afterEach(async () => {
  const households = createdHouseholds.splice(0);
  const users = createdUsers.splice(0);
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("generalized financial accounts", () => {
  it("represents manual positions across all four classes without Plaid identity", async () => {
    const fixture = await createHouseholdFixture();
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${fixture.key}-cash`,
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Cash",
          currentBalance: "100.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture.key}-invested`,
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Invested",
          currentBalance: "200.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture.key}-property`,
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Property",
          currentBalance: "300.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture.key}-debt`,
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Debt",
          currentBalance: "-150.00",
          isoCurrencyCode: "USD"
        }
      ]
    });

    const accounts = await prisma.financialAccount.findMany({
      where: { householdId: fixture.householdId },
      orderBy: { classification: "asc" }
    });

    expect(new Set(accounts.map((account) => account.classification))).toEqual(
      new Set(["CASH", "INVESTED", "PROPERTY", "DEBT"])
    );
    expect(
      accounts.every(
        (account) =>
          account.source === "MANUAL" &&
          account.plaidItemId === null &&
          account.plaidAccountId === null
      )
    ).toBe(true);
    expect(
      accounts.reduce(
        (netWorth, account) =>
          netWorth + (account.currentBalance?.toNumber() ?? 0),
        0
      )
    ).toBe(450);

    const overview = await getAccountOverview(fixture.householdId);
    expect(overview.connections).toEqual([]);
    expect(overview.accounts).toHaveLength(4);
    expect(
      overview.accounts.every(
        (account) =>
          account.source === "MANUAL" &&
          account.institution === "Manual account"
      )
    ).toBe(true);
  });

  it("enforces source identity at the database boundary", async () => {
    const fixture = await createHouseholdFixture();

    await expect(
      prisma.financialAccount.create({
        data: {
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "CASH",
          plaidAccountId: `${fixture.key}-provider-account`,
          name: "Invalid manual account"
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.financialAccount.create({
        data: {
          householdId: fixture.householdId,
          source: "PLAID",
          classification: "CASH",
          name: "Invalid Plaid account",
          type: "depository"
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.financialAccount.create({
        data: {
          householdId: fixture.householdId,
          source: "MANUAL",
          classification: "UNCLASSIFIED",
          name: "Invalid unclassified manual account",
          currentBalance: "10.00",
          isoCurrencyCode: "USD"
        }
      })
    ).rejects.toThrow();
  });

  it("links budget destinations explicitly and clears them when deleted", async () => {
    const fixture = await createHouseholdFixture();
    const account = await prisma.financialAccount.create({
      data: {
        householdId: fixture.householdId,
        source: "MANUAL",
        classification: "CASH",
        name: "Savings destination",
        currentBalance: "100.00",
        isoCurrencyCode: "USD"
      }
    });
    const category = await prisma.category.create({
      data: {
        householdId: fixture.householdId,
        name: `${fixture.key} savings`,
        section: "Savings"
      }
    });
    const month = await prisma.budgetMonth.create({
      data: {
        householdId: fixture.householdId,
        month: new Date("2026-09-01T00:00:00.000Z"),
        income: "1000.00"
      }
    });
    const allocation = await prisma.budgetAllocation.create({
      data: {
        budgetMonthId: month.id,
        categoryId: category.id,
        planned: "100.00",
        destinationAccountId: account.id
      },
      include: { destinationAccount: true }
    });

    expect(allocation.destinationAccount?.id).toBe(account.id);
    await prisma.financialAccount.delete({ where: { id: account.id } });
    await expect(
      prisma.budgetAllocation.findUniqueOrThrow({
        where: { id: allocation.id }
      })
    ).resolves.toMatchObject({ destinationAccountId: null });
  });
});

describe("financial account migration", () => {
  it("backfills legacy Plaid rows without losing identity or balance meaning", async () => {
    const connectionString =
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/currents";
    const client = new Client({ connectionString });
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const migrations = [
      "20260913170000_initial_foundation",
      "20260913172343_product_features",
      "20260916021500_passkey_authentication",
      "20260920013000_plaid_sync_checkpoints"
    ];

    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      for (const migration of migrations) {
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
        VALUES ('legacy-user', 'legacy@example.test', CURRENT_TIMESTAMP);
        INSERT INTO "Household" ("id", "name", "updatedAt")
        VALUES ('legacy-household', 'Legacy household', CURRENT_TIMESTAMP);
        INSERT INTO "PlaidItem" (
          "id", "householdId", "linkedByUserId", "plaidItemId",
          "accessTokenCiphertext", "accessTokenIv", "accessTokenTag", "updatedAt"
        )
        VALUES (
          'legacy-item', 'legacy-household', 'legacy-user', 'provider-item',
          'ciphertext', 'iv', 'tag', CURRENT_TIMESTAMP
        );
        INSERT INTO "FinancialAccount" (
          "id", "householdId", "plaidItemId", "plaidAccountId", "name",
          "type", "currentBalance", "updatedAt"
        )
        VALUES
          ('cash', 'legacy-household', 'legacy-item', 'provider-cash', 'Cash', 'depository', -25.00, CURRENT_TIMESTAMP),
          ('invested', 'legacy-household', 'legacy-item', 'provider-invested', 'Invested', 'investment', 100.00, CURRENT_TIMESTAMP),
          ('credit', 'legacy-household', 'legacy-item', 'provider-credit', 'Credit', 'credit', 40.00, CURRENT_TIMESTAMP),
          ('loan', 'legacy-household', 'legacy-item', 'provider-loan', 'Loan', 'loan', -5.00, CURRENT_TIMESTAMP);
      `);

      const migrationSql = await readFile(
        path.join(
          process.cwd(),
          "prisma",
          "migrations",
          "20260920023853_generalize_financial_accounts",
          "migration.sql"
        ),
        "utf8"
      );
      await client.query(migrationSql);

      const migrated = await client.query<{
        id: string;
        source: string;
        classification: string;
        plaidItemId: string;
        plaidAccountId: string;
        type: string;
        currentBalance: string;
      }>(`
        SELECT
          "id", "source", "classification", "plaidItemId",
          "plaidAccountId", "type", "currentBalance"
        FROM "FinancialAccount"
        ORDER BY "id"
      `);

      expect(migrated.rows).toEqual([
        {
          id: "cash",
          source: "PLAID",
          classification: "CASH",
          plaidItemId: "legacy-item",
          plaidAccountId: "provider-cash",
          type: "depository",
          currentBalance: "-25.00"
        },
        {
          id: "credit",
          source: "PLAID",
          classification: "DEBT",
          plaidItemId: "legacy-item",
          plaidAccountId: "provider-credit",
          type: "credit",
          currentBalance: "-40.00"
        },
        {
          id: "invested",
          source: "PLAID",
          classification: "INVESTED",
          plaidItemId: "legacy-item",
          plaidAccountId: "provider-invested",
          type: "investment",
          currentBalance: "100.00"
        },
        {
          id: "loan",
          source: "PLAID",
          classification: "DEBT",
          plaidItemId: "legacy-item",
          plaidAccountId: "provider-loan",
          type: "loan",
          currentBalance: "5.00"
        }
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("adds valuation history without fabricating snapshots or changing existing finance records", async () => {
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
      "20260920023853_generalize_financial_accounts"
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
        VALUES ('user', 'migration@example.test', CURRENT_TIMESTAMP);
        INSERT INTO "Household" ("id", "name", "updatedAt")
        VALUES ('household', 'Migration household', CURRENT_TIMESTAMP);
        INSERT INTO "PlaidItem" (
          "id", "householdId", "linkedByUserId", "plaidItemId",
          "accessTokenCiphertext", "accessTokenIv", "accessTokenTag", "updatedAt"
        ) VALUES (
          'item', 'household', 'user', 'provider-item',
          'ciphertext', 'iv', 'tag', CURRENT_TIMESTAMP
        );
        INSERT INTO "FinancialAccount" (
          "id", "householdId", "source", "classification", "plaidItemId",
          "plaidAccountId", "name", "type", "currentBalance", "updatedAt"
        ) VALUES (
          'account', 'household', 'PLAID', 'CASH', 'item',
          'provider-account', 'Checking', 'depository', 123.45, CURRENT_TIMESTAMP
        );
        INSERT INTO "Transaction" (
          "id", "householdId", "accountId", "plaidTransactionId",
          "name", "amount", "date", "updatedAt"
        ) VALUES (
          'transaction', 'household', 'account', 'provider-transaction',
          'Existing transaction', 12.34, '2026-09-12', CURRENT_TIMESTAMP
        );
        INSERT INTO "Category" (
          "id", "householdId", "name", "section", "updatedAt"
        ) VALUES (
          'category', 'household', 'Savings', 'Savings', CURRENT_TIMESTAMP
        );
        INSERT INTO "BudgetMonth" (
          "id", "householdId", "month", "income", "updatedAt"
        ) VALUES (
          'month', 'household', '2026-09-01', 1000, CURRENT_TIMESTAMP
        );
        INSERT INTO "BudgetAllocation" (
          "id", "budgetMonthId", "categoryId", "planned",
          "destinationAccountId", "updatedAt"
        ) VALUES (
          'allocation', 'month', 'category', 100, 'account', CURRENT_TIMESTAMP
        );
      `);

      const migrationSql = await readFile(
        path.join(
          process.cwd(),
          "prisma",
          "migrations",
          "20260921210000_manual_accounts_and_snapshots",
          "migration.sql"
        ),
        "utf8"
      );
      await client.query(migrationSql);

      const result = await client.query<{
        balance: string;
        plaidAccountId: string;
        transactionCount: string;
        destinationAccountId: string;
        snapshotCount: string;
      }>(`
        SELECT
          a."currentBalance" AS balance,
          a."plaidAccountId",
          (SELECT COUNT(*) FROM "Transaction") AS "transactionCount",
          b."destinationAccountId",
          (SELECT COUNT(*) FROM "AccountPositionSnapshot") AS "snapshotCount"
        FROM "FinancialAccount" a
        JOIN "BudgetAllocation" b ON b."destinationAccountId" = a."id"
        WHERE a."id" = 'account'
      `);
      expect(result.rows).toEqual([
        {
          balance: "123.45",
          plaidAccountId: "provider-account",
          transactionCount: "1",
          destinationAccountId: "account",
          snapshotCount: "0"
        }
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
