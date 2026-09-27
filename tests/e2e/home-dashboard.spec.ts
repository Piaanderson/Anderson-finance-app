import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/server/db";

test("Home traces household data across dynamic months and honest unavailable states", async ({
  page
}, testInfo) => {
  const fixture = `home-${testInfo.project.name}-${randomUUID()}`;
  const email = `${fixture}@example.test`;
  const plaidRequests: string[] = [];
  const pageErrors: string[] = [];
  let householdId: string | null = null;
  let userId: string | null = null;

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("request", (request) => {
    if (/plaid\.(com|net)/i.test(new URL(request.url()).hostname)) {
      plaidRequests.push(request.url());
    }
  });

  try {
    if (testInfo.project.name === "mobile") {
      await page.setViewportSize({ width: 375, height: 667 });
    }
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
    const accountIds = {
      checking: `${fixture}-checking`,
      savings: `${fixture}-savings`,
      debt: `${fixture}-debt`
    };
    const categoryIds = {
      needs: `${fixture}-needs`,
      savings: `${fixture}-savings-category`,
      debt: `${fixture}-debt-category`
    };
    const transferIds = {
      debtOut: `${fixture}-debt-out`,
      debtIn: `${fixture}-debt-in`,
      savingsOut: `${fixture}-savings-out`,
      savingsIn: `${fixture}-savings-in`
    };

    await prisma.financialAccount.createMany({
      data: [
        {
          id: accountIds.checking,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Home checking",
          currentBalance: "120.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.savings,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Home savings",
          currentBalance: "70.00",
          isoCurrencyCode: "USD"
        },
        {
          id: accountIds.debt,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Home card",
          currentBalance: "-20.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.category.createMany({
      data: [
        {
          id: categoryIds.needs,
          householdId,
          name: "Groceries",
          section: "Needs"
        },
        {
          id: categoryIds.savings,
          householdId,
          name: "Vacation",
          section: "Savings"
        },
        {
          id: categoryIds.debt,
          householdId,
          name: "Card paydown",
          section: "Debt"
        }
      ]
    });
    await prisma.budgetMonth.create({
      data: {
        id: `${fixture}-august-budget`,
        householdId,
        month: new Date("2026-08-01T00:00:00.000Z"),
        income: "300.00",
        allocations: {
          create: [
            {
              categoryId: categoryIds.debt,
              planned: "50.00",
              destinationAccountId: accountIds.debt
            },
            {
              categoryId: categoryIds.savings,
              planned: "40.00",
              destinationAccountId: accountIds.savings
            },
            {
              categoryId: categoryIds.needs,
              planned: "100.00",
              destinationAccountId: accountIds.checking
            }
          ]
        }
      }
    });
    await prisma.transaction.createMany({
      data: [
        {
          id: `${fixture}-july-income`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-july-income`,
          name: "July payroll",
          amount: "-80.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-07-02T00:00:00.000Z")
        },
        {
          id: `${fixture}-july-spending`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-july-spending`,
          name: "July groceries",
          amount: "50.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.needs,
          date: new Date("2026-07-03T00:00:00.000Z")
        },
        {
          id: `${fixture}-august-income`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-august-income`,
          name: "August payroll",
          amount: "-100.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-02T00:00:00.000Z")
        },
        {
          id: `${fixture}-august-spending`,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-august-spending`,
          name: "August groceries",
          merchantName: "Fixture grocer",
          amount: "40.00",
          isoCurrencyCode: "USD",
          categoryId: categoryIds.needs,
          pending: true,
          date: new Date("2026-08-05T00:00:00.000Z")
        },
        {
          id: transferIds.debtOut,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-debt-out`,
          name: "CARD PAYMENT",
          bankDescription: "CARD PAYMENT OUT",
          amount: "30.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-08T00:00:00.000Z")
        },
        {
          id: transferIds.debtIn,
          householdId,
          accountId: accountIds.debt,
          plaidTransactionId: `${fixture}-plaid-debt-in`,
          name: "PAYMENT RECEIVED",
          bankDescription: "CARD PAYMENT IN",
          amount: "-30.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-08T00:00:00.000Z")
        },
        {
          id: transferIds.savingsOut,
          householdId,
          accountId: accountIds.checking,
          plaidTransactionId: `${fixture}-plaid-savings-out`,
          name: "SAVINGS TRANSFER",
          amount: "20.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-07T00:00:00.000Z")
        },
        {
          id: transferIds.savingsIn,
          householdId,
          accountId: accountIds.savings,
          plaidTransactionId: `${fixture}-plaid-savings-in`,
          name: "SAVINGS DEPOSIT",
          amount: "-20.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-08-07T00:00:00.000Z")
        }
      ]
    });
    await prisma.transferMatch.createMany({
      data: [
        {
          id: `${fixture}-debt-match`,
          householdId,
          outgoingTransactionId: transferIds.debtOut,
          incomingTransactionId: transferIds.debtIn
        },
        {
          id: `${fixture}-savings-match`,
          householdId,
          outgoingTransactionId: transferIds.savingsOut,
          incomingTransactionId: transferIds.savingsIn
        }
      ]
    });
    const julySnapshot = new Date("2026-07-10T12:00:00.000Z");
    const augustSnapshot = new Date("2026-08-10T12:00:00.000Z");
    await prisma.accountPositionSnapshot.createMany({
      data: [
        [accountIds.checking, "100.00", julySnapshot, "checking-july"],
        [accountIds.savings, "50.00", julySnapshot, "savings-july"],
        [accountIds.debt, "-30.00", julySnapshot, "debt-july"],
        [accountIds.checking, "120.00", augustSnapshot, "checking-august"],
        [accountIds.savings, "70.00", augustSnapshot, "savings-august"],
        [accountIds.debt, "-20.00", augustSnapshot, "debt-august"]
      ].map(([accountId, signedBalance, effectiveAt, suffix]) => ({
        householdId: membership.householdId,
        accountId: accountId as string,
        signedBalance: signedBalance as string,
        isoCurrencyCode: "USD",
        effectiveAt: effectiveAt as Date,
        observedAt: effectiveAt as Date,
        source: "MANUAL" as const,
        dedupeKey: `${fixture}-${suffix}`
      }))
    });

    await page.goto("/dashboard?month=2026-08");
    await expect(
      page.getByRole("heading", { level: 1, name: "Home" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "August 2026" })
    ).toBeVisible();
    await expect(
      page
        .locator(".home-month-position")
        .getByText("Month complete · 31 days", { exact: false })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Previous month, same elapsed span: July 1, 2026–July 31, 2026"
      )
    ).toBeVisible();

    const netWorth = page.getByRole("region", { name: "Current net worth" });
    await expect(netWorth.getByText("$170.00").first()).toBeVisible();
    await expect(netWorth.getByText("+$50.00")).toBeVisible();
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
    await page.getByText("View recorded history points").click();
    await expect(
      page
        .getByRole("figure", { name: "Net worth, last 8 months" })
        .getByRole("list")
        .filter({ hasText: "$170.00" })
    ).toBeVisible();

    const cashFlow = page.getByRole("region", {
      name: "Income and spending"
    });
    await expect(cashFlow.getByText("$100.00").first()).toBeVisible();
    await expect(cashFlow.getByText("$40.00").first()).toBeVisible();
    await expect(cashFlow.getByText("$20.00 more")).toBeVisible();
    await expect(cashFlow.getByText("$10.00 less")).toBeVisible();
    await expect(cashFlow.getByText("1 pending movement")).toBeVisible();
    await expect(
      cashFlow.getByRole("heading", { level: 3, name: "Savings movement" })
    ).toBeVisible();
    await expect(
      cashFlow.getByRole("heading", { level: 3, name: "Debt paydown" })
    ).toBeVisible();

    const category = page.getByRole("region", {
      name: "Spending by category"
    });
    await expect(category.getByText("Groceries")).toBeVisible();
    await expect(
      category.getByRole("img", {
        name: "Groceries: $40.00 spent"
      })
    ).toBeVisible();

    const recent = page.getByRole("region", { name: "Recent movements" });
    expect(pageErrors).toEqual([]);
    const cardPayment = recent.getByRole("article", { name: "CARD PAYMENT" });
    await expect(
      cardPayment.getByRole("heading", { level: 3, name: "CARD PAYMENT" })
    ).toHaveCount(1);
    const disclosure = cardPayment.locator(".movement-disclosure");
    await expect(disclosure).toHaveAccessibleName("View both transfer legs");
    expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await recent.getByRole("link", { name: "Open transactions" }).focus();
    await page.keyboard.press("Tab");
    await expect(disclosure).toBeFocused();
    await expect
      .poll(() =>
        disclosure.evaluate((element) => getComputedStyle(element).outlineStyle)
      )
      .not.toBe("none");
    await disclosure.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(disclosure).toHaveAccessibleName("Hide both transfer legs");
    await expect(
      recent.getByRole("region", { name: "CARD PAYMENT" })
    ).toContainText("CARD PAYMENT OUT");
    await expect(
      recent.getByRole("region", { name: "CARD PAYMENT" })
    ).toContainText("CARD PAYMENT IN");

    const budget = page.getByRole("region", { name: "Budget snapshot" });
    await expect(budget.getByText("$110.00", { exact: true })).toBeVisible();
    await expect(budget.getByText("$30.00 moved · $20.00 due")).toBeVisible();
    await expect(budget.getByText("$20.00 moved · $20.00 due")).toBeVisible();
    await expect(budget.getByText("$40.00 paid · $60.00 due")).toBeVisible();
    await expect(
      budget.getByRole("img", { name: /Budget allocation:/ })
    ).toBeVisible();

    const obligations = page.getByRole("region", {
      name: "Remaining this month"
    });
    await expect(obligations.getByText("Card paydown")).toBeVisible();
    await expect(
      obligations.getByText(/not scheduled dates or predicted withdrawals/)
    ).toBeVisible();
    const accounts = page.getByRole("region", { name: "Account rollup" });
    await expect(accounts.getByText("$190.00")).toBeVisible();
    await expect(accounts.getByText("−$20.00")).toBeVisible();

    const previous = page.getByRole("link", {
      name: "Previous month, July 2026"
    });
    const next = page.getByRole("link", {
      name: "Next month, September 2026"
    });
    const current = page.getByRole("link", {
      name: /Current month, September 2026/
    });
    for (const control of [previous, next, current]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/month=2026-09/);
    await expect(
      page.locator(".home-month-position").getByText(/Day \d+ of 30/)
    ).toBeVisible();
    await page.getByRole("link", { name: "Next month, October 2026" }).click();
    await expect(page).toHaveURL(/month=2026-10/);
    await expect(
      page
        .locator(".home-month-position")
        .getByText("Month not started · 31 days", { exact: false })
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Comparison basis" })
        .getByText(
          "Previous-month comparison unavailable until October 2026 begins"
        )
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Current month, September 2026" })
      .click();
    await expect(page).toHaveURL(/month=2026-09/);

    await page.goto("/dashboard?month=2025-01");
    await expect(
      page.getByText("No cash-flow movements recorded")
    ).toBeVisible();
    await expect(
      page.getByText("No categorized spending recorded")
    ).toBeVisible();
    await expect(page.getByText("No movements recorded")).toBeVisible();
    await expect(page.getByText("Budget unavailable")).toBeVisible();
    await expect(page.getByText("Obligations unavailable")).toBeVisible();

    const itemId = `${fixture}-item`;
    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${fixture}-provider-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${fixture}-cad`,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Canadian investment",
          currentBalance: "50.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: `${fixture}-incomplete`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-provider-incomplete`,
          source: "PLAID",
          classification: "PROPERTY",
          name: "Incomplete property",
          type: "other",
          currentBalance: null,
          isoCurrencyCode: "USD"
        }
      ]
    });
    await page.goto("/dashboard?month=2026-08");
    await expect(page.getByText("Partial current net worth")).toBeVisible();
    await expect(netWorth.getByText("$50.00").first()).toBeVisible();
    await expect(netWorth.getByText("CAD")).toBeVisible();
    await expect(
      netWorth.getByText(/applies no implicit exchange rate/)
    ).toBeVisible();
    await expect(page.getByText("History unavailable")).toBeVisible();

    await prisma.financialAccount.updateMany({
      where: { householdId },
      data: { isActive: false, archivedAt: new Date() }
    });
    await page.goto("/dashboard?month=2025-01");
    await expect(page.getByText("Current net worth unavailable")).toBeVisible();
    await expect(page.getByText("No known positions").first()).toBeVisible();
    await expect(page.getByText("History unavailable")).toBeVisible();

    await page.goto("/dashboard?month=2026-08");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedDuration = await page
      .locator(".home-category-bar > span")
      .first()
      .evaluate((element) => {
        const duration = getComputedStyle(element).transitionDuration;
        return duration.endsWith("ms")
          ? Number.parseFloat(duration)
          : Number.parseFloat(duration) * 1000;
      });
    expect(reducedDuration).toBeLessThanOrEqual(0.01);

    const widths =
      testInfo.project.name === "mobile"
        ? [375]
        : [768, 1024, 1280, 1440, 1920];
    for (const width of widths) {
      await page.setViewportSize({
        width,
        height: width === 375 ? 667 : 1000
      });
      const viewport = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
    }

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
