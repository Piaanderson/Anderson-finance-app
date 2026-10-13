import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { prisma } from "../../src/server/db";

async function captureEvidence(
  page: import("@playwright/test").Page,
  projectName: string,
  stage: "after" | "after-truth-states"
) {
  const directory = process.env.ACCOUNTS_EVIDENCE_DIR;
  if (!directory || projectName !== "chromium") return;
  const originalViewport = page.viewportSize();
  await mkdir(directory, { recursive: true });
  await page.addStyleTag({
    content:
      "nextjs-portal { display: none !important; } .skip-link { visibility: hidden !important; }"
  });
  for (const width of [1280, 1920, 512, 390]) {
    await page.setViewportSize({ width, height: width >= 1280 ? 900 : 844 });
    const populatedRow = page.locator(".account-ledger-row").first();
    if (width >= 1280) {
      const columns = await populatedRow.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns
      );
      expect(columns.match(/minmax\(/g)).toHaveLength(5);
    } else {
      await expect(populatedRow.getByText("Balance today")).toBeVisible();
    }
    const pageWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.innerWidth);
    await page.screenshot({
      path: join(directory, `${stage}-${width}.png`),
      fullPage: true
    });
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function captureRepresentativeEvidence(
  page: import("@playwright/test").Page,
  projectName: string,
  expandedAccount: Locator,
  property: Locator
) {
  const directory = process.env.ACCOUNTS_EVIDENCE_DIR;
  if (!directory || projectName !== "chromium") return;
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expandedAccount.screenshot({
    path: join(directory, "after-expanded-1280.png")
  });
  await property.screenshot({
    path: join(directory, "after-property-1280.png")
  });
  if (originalViewport) await page.setViewportSize(originalViewport);
}

test("Accounts reconciles grouped positions and exposes honest accessible details", async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
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
    await expect(
      page.locator(".accounts-integrated-header").getByText("5 active accounts")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh all" })
    ).toBeDisabled();
    await expect(page.getByText("Global refresh unavailable")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add account" })
    ).toHaveAttribute("href", "#add-account-options");
    await expect(page.locator(".accounts-ledger-columns")).toContainText(
      "Balance today"
    );
    await expect(page.locator(".accounts-ledger-columns")).toContainText(
      "Before month end"
    );
    await expect(page.locator(".accounts-ledger-columns")).toContainText(
      "Projected"
    );
    expect(
      await page
        .locator(".account-ledger-group > .account-ledger-group-heading h2")
        .allTextContents()
    ).toEqual(["Cash", "Invested", "Debt", "Property"]);
    for (const group of ["Cash", "Invested", "Property", "Debt"]) {
      await expect(
        page.getByRole("region", { name: group, exact: true })
      ).toBeVisible();
    }
    const netWorthEquation = page.getByRole("region", { name: "Net worth" });
    await expect(netWorthEquation.getByText("$910.20").first()).toBeVisible();
    await expect(
      netWorthEquation.getByText(/Unclassified \$10\.00/)
    ).toBeVisible();
    await expect(
      netWorthEquation.getByText(
        /Cash \$100\.10.*Invested \$200\.20.*Home equity \$599\.90.*Debt \$0\.00/
      )
    ).toBeVisible();
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
    const disclosure = cashAccount.locator("summary").first();
    await expect(disclosure).toHaveJSProperty("tagName", "SUMMARY");
    await expect(disclosure.locator("xpath=..")).toHaveJSProperty(
      "tagName",
      "DETAILS"
    );
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
      cashAccount.getByRole("heading", {
        level: 4,
        name: "Scheduled before month end"
      })
    ).toBeVisible();
    await expect(
      cashAccount.getByRole("heading", {
        level: 4,
        name: "Its role in the budget"
      })
    ).toBeVisible();
    await expect(
      cashAccount.getByText("Projected by next paycheck")
    ).toBeVisible();
    await expect(
      cashAccount.getByText(/Balance floor unavailable/)
    ).toBeVisible();
    const supportDisclosure = cashAccount.getByText(
      "Source, activity, and account maintenance"
    );
    expect(
      (await supportDisclosure.boundingBox())?.height
    ).toBeGreaterThanOrEqual(44);
    await supportDisclosure.focus();
    await page.keyboard.press("Enter");
    await expect(
      cashAccount.getByText("Connected with Plaid").first()
    ).toBeVisible();
    await expect(
      cashAccount.getByRole("heading", { level: 4, name: "Source and status" })
    ).toBeVisible();
    await expect(cashAccount.getByText("Available balance:")).toBeVisible();
    await expect(cashAccount.getByText("$90.10")).toBeVisible();
    await expect(cashAccount.getByText("Fixture grocer")).toBeVisible();
    await expect(
      cashAccount.getByRole("link", {
        name: "Manage Fixture Bank connection"
      })
    ).toBeVisible();
    await supportDisclosure.click();

    const propertyAccount = page.getByRole("article", {
      name: "Primary home"
    });
    await expect(
      propertyAccount.getByText("Estimated value $1,000.30")
    ).toBeVisible();
    await expect(propertyAccount.getByText(/owed \$400\.40/)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Debt", exact: true })
        .getByRole("heading", { name: "Home mortgage" })
    ).toHaveCount(0);
    await expect(
      propertyAccount.getByText("Debt source and maintenance for Home mortgage")
    ).toBeVisible();
    await propertyAccount
      .getByText("Property source and maintenance for Primary home")
      .click();
    await expect(propertyAccount.getByText("Derived equity:")).toBeVisible();
    await expect(
      propertyAccount.getByText("$599.90", { exact: true }).last()
    ).toBeVisible();
    await expect(
      propertyAccount.getByText(/source records/, { exact: false })
    ).toBeVisible();
    await propertyAccount
      .getByText("Property source and maintenance for Primary home")
      .click();
    await captureRepresentativeEvidence(
      page,
      testInfo.project.name,
      cashAccount,
      propertyAccount
    );
    await captureEvidence(page, testInfo.project.name, "after");

    const manualRoth = page.getByRole("article", { name: "Manual Roth" });
    await manualRoth.locator("summary").first().click();
    const rename = manualRoth.getByRole("button", {
      name: "Rename Manual Roth"
    });
    await rename.click();
    const renameInput = manualRoth.getByLabel("Account name");
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toBeFocused();

    const unknownAccount = page.getByRole("article", {
      name: "Unknown provider account"
    });
    await unknownAccount.locator("summary").first().click();
    await unknownAccount
      .getByText("Source, activity, and account maintenance")
      .click();
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
        },
        {
          id: `${fixture}-cad-missing`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-cad-missing`,
          source: "PLAID",
          classification: "INVESTED",
          name: "Canadian investment unavailable",
          type: "investment",
          currentBalance: null,
          isoCurrencyCode: "CAD"
        },
        {
          id: `${fixture}-cad-unclassified-missing`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-cad-unclassified-missing`,
          source: "PLAID",
          classification: "UNCLASSIFIED",
          name: "Canadian account needs classification",
          type: "other",
          currentBalance: null,
          isoCurrencyCode: "CAD"
        },
        {
          id: `${fixture}-mixed-property`,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Mixed currency property",
          currentBalance: "1000.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture}-mixed-cad-debt`,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "CAD linked mortgage",
          currentBalance: "-200.00",
          isoCurrencyCode: "CAD"
        },
        {
          id: `${fixture}-mixed-missing-debt`,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-mixed-missing-debt`,
          source: "PLAID",
          classification: "DEBT",
          name: "Missing linked mortgage",
          type: "loan",
          currentBalance: null,
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture}-underwater-property`,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Underwater property",
          currentBalance: "200.00",
          isoCurrencyCode: "USD"
        },
        {
          id: `${fixture}-underwater-debt`,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Underwater mortgage",
          currentBalance: "-300.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.propertyDebtLink.createMany({
      data: [
        {
          householdId,
          propertyAccountId: `${fixture}-underwater-property`,
          debtAccountId: `${fixture}-underwater-debt`
        },
        {
          householdId,
          propertyAccountId: `${fixture}-mixed-property`,
          debtAccountId: `${fixture}-mixed-cad-debt`
        },
        {
          householdId,
          propertyAccountId: `${fixture}-mixed-property`,
          debtAccountId: `${fixture}-mixed-missing-debt`
        }
      ]
    });
    await page.reload();
    await expect(
      page.locator(".account-equation-warning").getByText("Partial net worth")
    ).toBeVisible();
    await expect(
      page.getByText(/Missing values or currencies are not treated as zero/)
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Partial net worth" })
        .getByText(
          /Property value \/ home equity unavailable.*Debt unavailable/
        )
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Partial net worth" })
        .getByText(
          /Cash CA\$50\.00.*Invested unavailable.*Debt CA\$200\.00.*Unclassified unavailable/
        )
    ).toBeVisible();
    await expect(
      page.getByText(
        "Property value · equity unavailable due to conflicting or incomplete links"
      )
    ).toBeVisible();
    const debtGroup = page.getByRole("region", { name: "Debt", exact: true });
    await expect(
      debtGroup.getByRole("heading", { name: "CAD linked mortgage" })
    ).toBeVisible();
    await expect(
      debtGroup.getByRole("heading", { name: "Missing linked mortgage" })
    ).toBeVisible();
    const mixedProperty = page.getByRole("article", {
      name: "Mixed currency property"
    });
    await expect(
      mixedProperty.locator(".account-unavailable").filter({
        hasText: "Linked balances are missing or use different currencies"
      })
    ).toBeVisible();
    await expect(
      page.getByText(/does not apply an implicit exchange rate/)
    ).toBeVisible();
    await expect(page.getByText("History unavailable")).toBeVisible();
    await expect(
      page.getByText(/never fills missing months or reconstructs/)
    ).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "Value unavailable" })
        .getByText(/Owed\/equity bar unavailable/)
    ).toBeVisible();
    const underwaterProperty = page.getByRole("article", {
      name: "Underwater property"
    });
    await expect(
      underwaterProperty.getByText(/Negative equity −\$100\.00/)
    ).toBeVisible();
    await expect(
      underwaterProperty.getByRole("img", {
        name: /Negative equity −\$100\.00/
      })
    ).toBeVisible();
    await captureEvidence(page, testInfo.project.name, "after-truth-states");

    const ledgerRow = page
      .getByRole("article", { name: "Fixture checking" })
      .locator("summary")
      .first();
    if (testInfo.project.name === "mobile") {
      await expect(ledgerRow.getByText("Balance today")).toBeVisible();
      const columns = await ledgerRow.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns
      );
      expect(columns.split(" ").length).toBeLessThanOrEqual(2);
    } else {
      await expect(page.locator(".accounts-ledger-columns")).toContainText(
        "Before month end"
      );
      const columns = await ledgerRow.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns
      );
      expect(columns.match(/minmax\(/g)).toHaveLength(5);
    }

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
