import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/server/db";

test("Accounts reconciles grouped positions and exposes honest accessible details", async ({
  page
}, testInfo) => {
  const fixture = `accounts-view-${testInfo.project.name}-${randomUUID()}`;
  const email = `${fixture}@example.test`;
  const plaidRequests: string[] = [];
  let householdId: string | null = null;
  let userId: string | null = null;

  page.on("request", (request) => {
    if (/plaid\.(com|net)/i.test(new URL(request.url()).hostname)) {
      plaidRequests.push(request.url());
    }
  });

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Development email").fill(email);
    await page
      .getByRole("button", { name: "Local development sign-in" })
      .click();
    await expect(page).toHaveURL(/\/accounts$/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const membership = await prisma.householdMember.findFirstOrThrow({
      where: { userId: user.id }
    });
    userId = user.id;
    householdId = membership.householdId;
    const itemId = `${fixture}-item`;
    const accountIds = {
      cash: `${fixture}-cash`,
      unclassified: `${fixture}-unclassified`,
      invested: `${fixture}-invested`,
      property: `${fixture}-property`,
      debt: `${fixture}-debt`
    };

    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${fixture}-plaid-item`,
        institutionName: "Fixture Bank",
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture",
        status: "ACTIVE",
        lastSyncedAt: new Date()
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: accountIds.cash,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-cash`,
          source: "PLAID",
          classification: "CASH",
          name: "Fixture checking",
          mask: "4187",
          type: "depository",
          subtype: "checking",
          currentBalance: "100.10",
          availableBalance: "90.10",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.unclassified,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-unknown`,
          source: "PLAID",
          classification: "UNCLASSIFIED",
          name: "Unknown provider account",
          type: "other",
          currentBalance: "10.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.invested,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Manual Roth",
          currentBalance: "200.20",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.property,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Primary home",
          currentBalance: "1000.30",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.debt,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Home mortgage",
          currentBalance: "-400.40",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.propertyDebtLink.create({
      data: {
        householdId,
        propertyAccountId: accountIds.property,
        debtAccountId: accountIds.debt
      }
    });
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: accountIds.cash,
        plaidTransactionId: `${fixture}-transaction`,
        name: "GROCERY STORE",
        merchantName: "Fixture grocer",
        amount: "10.00",
        isoCurrencyCode: "USD",
        date: new Date("2026-09-20T00:00:00.000Z")
      }
    });

    const firstEffectiveAt = new Date("2026-04-01T12:00:00.000Z");
    const secondEffectiveAt = new Date("2026-05-01T12:00:00.000Z");
    const observedAt = new Date("2026-09-20T18:00:00.000Z");
    await prisma.accountPositionSnapshot.createMany({
      data: [
        [accountIds.cash, "90.10", "PLAID_SYNC"],
        [accountIds.unclassified, "10.00", "PLAID_SYNC"],
        [accountIds.invested, "200.20", "MANUAL"],
        [accountIds.property, "1000.30", "MANUAL"],
        [accountIds.debt, "-400.40", "MANUAL"]
      ].map(([accountId, signedBalance, source], index) => ({
        householdId: membership.householdId,
        accountId,
        signedBalance,
        isoCurrencyCode: "USD",
        effectiveAt: firstEffectiveAt,
        observedAt,
        source: source as "PLAID_SYNC" | "MANUAL",
        dedupeKey: `${fixture}-snapshot-first-${index}`
      }))
    });
    await prisma.accountPositionSnapshot.create({
      data: {
        householdId,
        accountId: accountIds.cash,
        signedBalance: "100.10",
        isoCurrencyCode: "USD",
        effectiveAt: secondEffectiveAt,
        observedAt,
        source: "PLAID_SYNC",
        dedupeKey: `${fixture}-snapshot-second`
      }
    });

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Accounts" })
    ).toBeVisible();
    for (const group of ["Cash", "Invested", "Property", "Debt"]) {
      await expect(
        page.getByRole("region", { name: group, exact: true })
      ).toBeVisible();
    }
    const balanceSheet = page.getByRole("region", { name: "Net worth" });
    await expect(balanceSheet.getByText("$910.20").first()).toBeVisible();
    await expect(balanceSheet.getByText("Reconciled exactly")).toBeVisible();
    await expect(balanceSheet.getByText(/Unclassified \$10\.00/)).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Net worth, last 8 months"
      })
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: "Net worth from recorded account position observations"
      })
    ).toBeVisible();

    const cashAccount = page.getByRole("article", {
      name: "Fixture checking"
    });
    await expect(
      cashAccount.getByText("Connected with Plaid").first()
    ).toBeVisible();
    const disclosure = cashAccount.getByText("View account details");
    expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await disclosure.focus();
    await expect(disclosure).toBeFocused();
    await expect
      .poll(() =>
        disclosure.evaluate((element) => getComputedStyle(element).outlineStyle)
      )
      .not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(
      cashAccount.getByRole("heading", { level: 4, name: "Source and status" })
    ).toBeVisible();
    await expect(cashAccount.getByText("Available balance:")).toBeVisible();
    await expect(cashAccount.getByText("$90.10")).toBeVisible();
    await expect(cashAccount.getByText("Fixture grocer")).toBeVisible();
    await expect(
      cashAccount.getByRole("heading", { level: 4, name: "Projection" })
    ).toBeVisible();
    await expect(
      cashAccount.getByRole("link", {
        name: "Manage Fixture Bank connection"
      })
    ).toBeVisible();

    const propertyAccount = page.getByRole("article", {
      name: "Primary home"
    });
    await propertyAccount.getByText("View account details").click();
    await expect(propertyAccount.getByText("Derived equity:")).toBeVisible();
    await expect(propertyAccount.getByText("$599.90")).toBeVisible();
    await expect(
      propertyAccount.getByText(/source records/, { exact: false })
    ).toBeVisible();

    const unknownAccount = page.getByRole("article", {
      name: "Unknown provider account"
    });
    await unknownAccount.getByText("View account details").click();
    await unknownAccount
      .getByLabel("Account group for Unknown provider account")
      .selectOption("INVESTED");
    const saveGroup = unknownAccount.getByRole("button", {
      name: "Save account group"
    });
    await saveGroup.focus();
    await page.keyboard.press("Enter");
    await expect(
      unknownAccount
        .getByRole("status")
        .getByText(/connected account was classified/)
    ).toBeFocused();
    await expect(
      prisma.financialAccount.findUniqueOrThrow({
        where: { id: accountIds.unclassified }
      })
    ).resolves.toMatchObject({ classification: "INVESTED" });
    await expect(
      page.getByRole("heading", { level: 2, name: "Needs classification" })
    ).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedDuration = await cashAccount.evaluate((element) => {
      const duration = getComputedStyle(element).transitionDuration;
      return duration.endsWith("ms")
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
    });
    expect(reducedDuration).toBeLessThanOrEqual(0.01);

    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${fixture}-cad`,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Canadian cash",
          currentBalance: "50.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: `${fixture}-missing`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-missing`,
          source: "PLAID",
          classification: "PROPERTY",
          name: "Value unavailable",
          type: "other",
          currentBalance: null,
          isoCurrencyCode: "USD"
        }
      ]
    });
    await page.reload();
    await expect(page.getByText("Partial net worth")).toBeVisible();
    await expect(
      page.getByText(/Missing values are not treated as zero/)
    ).toBeVisible();
    await expect(
      page.getByText(/does not apply an implicit exchange rate/)
    ).toBeVisible();
    await expect(page.getByText("History unavailable")).toBeVisible();
    await expect(
      page.getByText(/never fills missing months or reconstructs/)
    ).toBeVisible();

    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(plaidRequests).toEqual([]);
  } finally {
    if (householdId) {
      await prisma.household.deleteMany({ where: { id: householdId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});
