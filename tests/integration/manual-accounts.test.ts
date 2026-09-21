import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  archiveManualAccount,
  createManualAccount,
  linkPropertyDebt,
  ManualAccountError,
  unlinkPropertyDebt,
  updateManualAccount
} from "@/features/accounts/manual-accounts";
import { getHouseholdPositionSummary } from "@/features/accounts/position-summary";
import { getHouseholdSnapshotObservations } from "@/features/accounts/position-snapshots";
import { prisma } from "@/server/db";

const createdHouseholds: string[] = [];

async function household(name: string) {
  const id = `manual-${randomUUID()}`;
  createdHouseholds.push(id);
  await prisma.household.create({ data: { id, name } });
  return id;
}

afterEach(async () => {
  const ids = createdHouseholds.splice(0);
  await prisma.household.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("manual account valuations", () => {
  it("creates, updates, deduplicates, backdates, and archives without losing history", async () => {
    const householdId = await household("Manual valuation fixture");
    const account = await createManualAccount(householdId, {
      name: "Home",
      classification: "PROPERTY",
      entryBalance: 300000,
      isoCurrencyCode: "USD",
      effectiveAt: new Date("2026-09-10T12:00:00.000Z")
    });

    await updateManualAccount(householdId, account.id, {
      name: "Primary home",
      classification: "PROPERTY",
      entryBalance: 310000,
      isoCurrencyCode: "USD",
      effectiveAt: new Date("2026-09-12T12:00:00.000Z")
    });
    await updateManualAccount(householdId, account.id, {
      name: "Primary home",
      classification: "PROPERTY",
      entryBalance: 290000,
      isoCurrencyCode: "USD",
      effectiveAt: new Date("2026-09-01T12:00:00.000Z")
    });
    await updateManualAccount(householdId, account.id, {
      name: "Primary home",
      classification: "PROPERTY",
      entryBalance: 290000,
      isoCurrencyCode: "USD",
      effectiveAt: new Date("2026-09-01T12:00:00.000Z")
    });

    const current = await prisma.financialAccount.findUniqueOrThrow({
      where: { id: account.id }
    });
    expect(current).toMatchObject({
      source: "MANUAL",
      classification: "PROPERTY",
      name: "Primary home",
      isoCurrencyCode: "USD"
    });
    expect(current.currentBalance?.toString()).toBe("310000");
    expect(
      await prisma.accountPositionSnapshot.count({
        where: { accountId: account.id }
      })
    ).toBe(3);

    await archiveManualAccount(householdId, account.id);
    await expect(
      prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })
    ).resolves.toMatchObject({ isActive: false });
    expect(
      await prisma.accountPositionSnapshot.count({
        where: { accountId: account.id }
      })
    ).toBe(3);
    const summary = await getHouseholdPositionSummary(householdId);
    expect(summary.accountCount).toBe(0);
    expect(summary.totals).toEqual([]);
  });

  it("keeps unlike currencies in separate household totals", async () => {
    const householdId = await household("Currency fixture");
    await createManualAccount(householdId, {
      name: "US cash",
      classification: "CASH",
      entryBalance: 100,
      isoCurrencyCode: "USD",
      effectiveAt: new Date("2026-09-12T12:00:00.000Z")
    });
    await createManualAccount(householdId, {
      name: "Canadian cash",
      classification: "CASH",
      entryBalance: 100,
      isoCurrencyCode: "CAD",
      effectiveAt: new Date("2026-09-12T12:00:00.000Z")
    });

    const summary = await getHouseholdPositionSummary(householdId);
    expect(summary.totals).toEqual([
      { currency: "CAD", amount: 100 },
      { currency: "USD", amount: 100 }
    ]);
  });
});

describe("property and debt relationships", () => {
  it("links separate signed records and rejects invalid or foreign relationships", async () => {
    const householdA = await household("Relationship household A");
    const householdB = await household("Relationship household B");
    const effectiveAt = new Date("2026-09-12T12:00:00.000Z");
    const property = await createManualAccount(householdA, {
      name: "Home",
      classification: "PROPERTY",
      entryBalance: 400000,
      isoCurrencyCode: "USD",
      effectiveAt
    });
    const debt = await createManualAccount(householdA, {
      name: "Mortgage",
      classification: "DEBT",
      entryBalance: 250000,
      isoCurrencyCode: "USD",
      effectiveAt
    });
    const foreignDebt = await createManualAccount(householdB, {
      name: "Foreign mortgage",
      classification: "DEBT",
      entryBalance: 100000,
      isoCurrencyCode: "USD",
      effectiveAt
    });

    const link = await linkPropertyDebt(householdA, property.id, debt.id);
    await expect(
      linkPropertyDebt(householdA, property.id, foreignDebt.id)
    ).rejects.toThrow(ManualAccountError);
    await expect(
      linkPropertyDebt(householdA, property.id, property.id)
    ).rejects.toThrow(ManualAccountError);
    await expect(
      linkPropertyDebt(householdA, debt.id, property.id)
    ).rejects.toThrow(ManualAccountError);

    const summary = await getHouseholdPositionSummary(householdA);
    expect(summary.totals).toEqual([{ currency: "USD", amount: 150000 }]);
    await expect(unlinkPropertyDebt(householdB, link.id)).rejects.toThrow(
      ManualAccountError
    );
    await unlinkPropertyDebt(householdA, link.id);
    await expect(
      prisma.propertyDebtLink.findUnique({ where: { id: link.id } })
    ).resolves.toBeNull();
  });

  it("scopes snapshot history to the requested household and real observations", async () => {
    const householdA = await household("History household A");
    const householdB = await household("History household B");
    const effectiveAt = new Date("2026-09-12T12:00:00.000Z");
    await createManualAccount(householdA, {
      name: "A cash",
      classification: "CASH",
      entryBalance: 25,
      isoCurrencyCode: "USD",
      effectiveAt
    });
    await createManualAccount(householdB, {
      name: "B cash",
      classification: "CASH",
      entryBalance: 75,
      isoCurrencyCode: "USD",
      effectiveAt
    });

    const observations = await getHouseholdSnapshotObservations(
      householdA,
      new Date("2026-01-01T00:00:00.000Z")
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]?.signedBalance?.toString()).toBe("25");
    expect(observations[0]?.effectiveAt).toEqual(effectiveAt);
  });
});
