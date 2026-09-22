import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/server/db";

test("sign-in surface has no automatically detectable WCAG violations", async ({
  page
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your money, in motion." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with a passkey" })
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("owner setup surface has no automatically detectable WCAG violations", async ({
  page
}) => {
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { level: 1, name: "Set up the owner account" })
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("a local user can sign in and use the shared application shell", async ({
  page
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Development email").fill("owner@currents.local");
  await page.getByRole("button", { name: "Local development sign-in" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Accounts" })
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("link", { name: "Budget" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Budget" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("account recovery controls are labelled, keyboard-operable, and announced", async ({
  page
}, testInfo) => {
  const fixture = `account-controls-${testInfo.project.name}-${randomUUID()}`;
  const email = `${fixture}@example.test`;
  let householdId: string | null = null;
  let userId: string | null = null;

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
    const loginItemId = `${fixture}-login-item`;
    const errorItemId = `${fixture}-error-item`;
    await prisma.plaidItem.createMany({
      data: [
        {
          id: loginItemId,
          householdId,
          linkedByUserId: userId,
          plaidItemId: `${fixture}-login-plaid-item`,
          institutionName: "Fixture reconnect bank",
          accessTokenCiphertext: "fixture",
          accessTokenIv: "fixture",
          accessTokenTag: "fixture",
          status: "LOGIN_REQUIRED",
          errorCode: "ITEM_LOGIN_REQUIRED",
          lastSyncedAt: new Date("2026-09-18T12:00:00.000Z")
        },
        {
          id: errorItemId,
          householdId,
          linkedByUserId: userId,
          plaidItemId: `${fixture}-error-plaid-item`,
          institutionName: "Fixture error bank",
          accessTokenCiphertext: "fixture",
          accessTokenIv: "fixture",
          accessTokenTag: "fixture",
          status: "ERROR",
          errorCode: "INSTITUTION_NOT_RESPONDING",
          lastSyncedAt: new Date("2026-09-19T12:00:00.000Z")
        }
      ]
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: `${fixture}-login-account`,
          householdId,
          plaidItemId: loginItemId,
          plaidAccountId: `${fixture}-login-plaid-account`,
          source: "PLAID",
          classification: "CASH",
          name: "Reconnect checking",
          type: "depository",
          currentBalance: "250.00"
        },
        {
          id: `${fixture}-error-account`,
          householdId,
          plaidItemId: errorItemId,
          plaidAccountId: `${fixture}-error-plaid-account`,
          source: "PLAID",
          classification: "CASH",
          name: "Error checking",
          type: "depository",
          currentBalance: "125.00"
        }
      ]
    });
    await page.route("**/api/plaid/items/**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ queued: true })
        });
        return;
      }
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.continue();
    });
    await page.reload();

    const reconnectCard = page.getByRole("article", {
      name: "Fixture reconnect bank"
    });
    const errorCard = page.getByRole("article", {
      name: "Fixture error bank"
    });
    await expect(reconnectCard.getByText("Reconnect required")).toBeVisible();
    await expect(
      reconnectCard.getByRole("button", {
        name: "Reconnect Fixture reconnect bank",
        exact: true
      })
    ).toBeVisible();
    await expect(errorCard.getByText("Sync stopped")).toBeVisible();

    const retry = errorCard.getByRole("button", {
      name: "Try sync again for Fixture error bank",
      exact: true
    });
    await retry.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(retry).toBeFocused();
    await expect
      .poll(() =>
        retry.evaluate((element) => getComputedStyle(element).outlineStyle)
      )
      .not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(
      errorCard.getByRole("status").getByText("Sync retry queued.")
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  } finally {
    if (householdId) {
      await prisma.household.deleteMany({ where: { id: householdId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});

test("manual accounts expose accessible validation, valuation, linking, and archive flows", async ({
  page
}, testInfo) => {
  const fixture = `manual-accounts-${testInfo.project.name}-${randomUUID()}`;
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

    const createForm = page
      .getByRole("heading", { level: 3, name: "Account details" })
      .locator("..");
    await createForm.getByLabel("Account name").fill("X");
    await createForm.getByLabel("Account type").selectOption("DEBT");
    await createForm.getByLabel("Amount owed").fill("-10");
    await createForm.getByLabel("Currency").fill("ZZZ");
    await createForm
      .getByRole("button", { name: "Add manual account" })
      .click();
    await expect(createForm.getByRole("alert")).toContainText(
      "Check the highlighted fields."
    );
    await expect(createForm.getByLabel("Account name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(createForm.getByLabel("Amount owed")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(createForm.getByLabel("Currency")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(createForm.getByLabel("Account type")).toHaveValue("DEBT");

    await createForm.getByLabel("Account name").fill("Manual mortgage");
    await createForm.getByLabel("Amount owed").fill("250000");
    await createForm.getByLabel("Currency").fill("USD");
    const submit = createForm.getByRole("button", {
      name: "Add manual account"
    });
    await submit.focus();
    await expect(submit).toBeFocused();
    const size = await submit.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");
    await expect(createForm.getByRole("status")).toContainText(
      "Manual mortgage was added."
    );
    await expect(
      page
        .getByRole("heading", { level: 3, name: "Manual mortgage" })
        .locator("..")
        .getByText("−$250,000.00")
    ).toBeVisible();

    await createForm.getByLabel("Account name").fill("Primary home");
    await createForm.getByLabel("Account type").selectOption("PROPERTY");
    await createForm.getByLabel("Current value").fill("400000");
    await createForm
      .getByRole("button", { name: "Add manual account" })
      .click();
    await expect(createForm.getByRole("status")).toContainText(
      "Primary home was added."
    );

    await page
      .getByLabel("Property", { exact: true })
      .selectOption({ label: "Primary home" });
    await page
      .getByLabel("Related debt", { exact: true })
      .selectOption({ label: "Manual mortgage" });
    await page.getByRole("button", { name: "Link property and debt" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Property and debt linked." })
    ).toBeVisible();
    await expect(page.getByText("Derived equity:")).toBeVisible();
    await expect(
      page.locator(".property-pair").getByText("$150,000.00")
    ).toBeVisible();

    const mortgageHeading = page.getByRole("heading", {
      level: 3,
      name: "Manual mortgage"
    });
    const mortgageCard = mortgageHeading.locator("..");
    const disclosure = mortgageCard.getByText("Edit or archive");
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toBeFocused();
    const editForm = mortgageCard
      .getByRole("heading", { name: "Edit Manual mortgage" })
      .locator("..");
    await editForm.getByLabel("Account name").fill("Updated mortgage");
    await editForm.getByLabel("Amount owed").fill("240000");
    await editForm.getByRole("button", { name: "Save account" }).click();
    await expect(
      page
        .getByRole("heading", { name: "Edit Updated mortgage" })
        .locator("..")
        .getByRole("status")
    ).toContainText("Updated mortgage was updated.");
    await expect(
      page
        .getByRole("heading", { level: 3, name: "Updated mortgage" })
        .locator("..")
        .getByText("−$240,000.00")
    ).toBeVisible();

    const updatedMortgageCard = page
      .getByRole("heading", {
        level: 3,
        name: "Updated mortgage"
      })
      .locator("..");
    const updatedDetails = updatedMortgageCard.locator("details");
    if ((await updatedDetails.getAttribute("open")) === null) {
      await updatedMortgageCard.getByText("Edit or archive").click();
    }
    page.once("dialog", (dialog) => dialog.accept());
    await updatedMortgageCard
      .getByRole("button", { name: "Archive Updated mortgage" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Updated mortgage" })
    ).toHaveCount(0);

    const archived = await prisma.financialAccount.findFirstOrThrow({
      where: { householdId, name: "Updated mortgage" }
    });
    expect(archived.isActive).toBe(false);
    expect(
      await prisma.accountPositionSnapshot.count({
        where: { accountId: archived.id }
      })
    ).toBeGreaterThanOrEqual(2);

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

test("transfer review ties and unties one movement accessibly", async ({
  page
}, testInfo) => {
  const fixture = `movements-${testInfo.project.name}-${randomUUID()}`;
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
    const checkingId = `${fixture}-checking`;
    const cardId = `${fixture}-card`;
    const outgoingId = `${fixture}-outgoing`;
    const incomingId = `${fixture}-incoming`;
    const categoryId = `${fixture}-category`;
    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${fixture}-plaid-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.createMany({
      data: [
        {
          id: checkingId,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-checking`,
          source: "PLAID",
          classification: "CASH",
          name: "Fixture checking",
          mask: "1111",
          type: "depository"
        },
        {
          id: cardId,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-plaid-card`,
          source: "PLAID",
          classification: "DEBT",
          name: "Fixture card",
          mask: "2222",
          type: "credit"
        }
      ]
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        householdId,
        name: "Fixture category",
        section: "Needs"
      }
    });
    await prisma.transaction.createMany({
      data: [
        {
          id: outgoingId,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-outgoing`,
          name: "ONLINE PAYMENT",
          merchantName: "Card payment",
          bankDescription: "ACH PAYMENT CARD 2222",
          paymentMemo: "September payment",
          referenceNumber: "REF-OUT",
          paymentChannel: "online",
          transactionCode: "transfer",
          amount: "400.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-09T00:00:00.000Z"),
          authorizedDate: new Date("2026-09-08T00:00:00.000Z")
        },
        {
          id: incomingId,
          householdId,
          accountId: cardId,
          plaidTransactionId: `${fixture}-plaid-incoming`,
          name: "PAYMENT RECEIVED",
          bankDescription: "THANK YOU PAYMENT",
          referenceNumber: "REF-IN",
          amount: "-400.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-10T00:00:00.000Z")
        },
        {
          id: `${fixture}-coffee`,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-coffee`,
          name: "COFFEE SHOP 123",
          merchantName: "Coffee shop",
          amount: "6.50",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-11T00:00:00.000Z"),
          pending: true
        }
      ]
    });
    await page.goto("/transactions");
    await expect(
      page.getByRole("heading", { level: 1, name: "Transactions" })
    ).toBeVisible();

    const transferReview = page.locator('[data-review-order="transfers"]');
    const categoryReview = page.locator('[data-review-order="categories"]');
    await expect(transferReview).toBeVisible();
    await expect(categoryReview).toBeVisible();
    await expect(transferReview.getByText("1 to review")).toBeVisible();
    const transferBox = await transferReview.boundingBox();
    const categoryBox = await categoryReview.boundingBox();
    expect((transferBox?.y ?? 0) < (categoryBox?.y ?? 0)).toBe(true);
    await expect(
      transferReview.getByRole("heading", {
        level: 3,
        name: "Unmatched-leg tray"
      })
    ).toBeVisible();
    await expect(
      transferReview.getByRole("heading", {
        level: 3,
        name: "Why this is suggested"
      })
    ).toBeVisible();
    await expect(
      transferReview.getByText("Exact 400.00 USD amount.")
    ).toBeVisible();
    await expect(
      transferReview.getByText(
        "Different accounts: Fixture checking → Fixture card."
      )
    ).toBeVisible();
    await expect(
      transferReview.getByText("Effective dates are 2 days apart.")
    ).toBeVisible();

    const candidateLegs = transferReview.locator(".suggestion-leg");
    await expect(candidateLegs).toHaveCount(2);
    const candidateOut = await candidateLegs.nth(0).boundingBox();
    const candidateIn = await candidateLegs.nth(1).boundingBox();
    if (testInfo.project.name === "mobile") {
      expect((candidateIn?.y ?? 0) > (candidateOut?.y ?? 0)).toBe(true);
    } else {
      expect(
        Math.abs((candidateIn?.y ?? 0) - (candidateOut?.y ?? 0))
      ).toBeLessThan(8);
    }

    const skip = transferReview.getByRole("button", {
      name: "Skip for now"
    });
    await skip.focus();
    await page.keyboard.press("Space");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Transfer suggestion skipped for now" })
    ).toBeAttached();
    await expect(transferReview).toHaveCount(0);
    await expect(
      categoryReview.getByRole("combobox", {
        name: "Search and choose a category"
      })
    ).toBeFocused();
    await page.reload();
    await expect(transferReview).toBeVisible();

    const inspect = transferReview.getByRole("button", {
      name: "Inspect both candidate legs"
    });
    const candidateDetailId = await inspect.getAttribute("aria-controls");
    expect(candidateDetailId).toBeTruthy();
    await inspect.focus();
    await page.keyboard.press("Space");
    await expect(
      transferReview.getByRole("button", {
        name: "Hide both candidate legs"
      })
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${candidateDetailId}`)).toContainText(
      "ACH PAYMENT CARD 2222"
    );
    await expect(page.locator(`#${candidateDetailId}`)).toContainText(
      "THANK YOU PAYMENT"
    );

    const tie = transferReview.getByRole("button", {
      name: "Tie as one transfer"
    });
    const tieTarget = await tie.boundingBox();
    expect(tieTarget?.height).toBeGreaterThanOrEqual(44);
    await tie.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "were tied as one transfer" })
    ).toBeAttached();
    await expect(transferReview).toHaveCount(0);
    await expect(
      categoryReview.getByRole("combobox", {
        name: "Search and choose a category"
      })
    ).toBeFocused();

    await expect(page.getByText("2 movements")).toBeVisible();
    const movementLedger = page.locator(".movement-ledger");
    await expect(
      movementLedger.getByRole("heading", {
        level: 3,
        name: "Card payment"
      })
    ).toHaveCount(1);
    await expect(
      movementLedger.getByRole("heading", {
        level: 3,
        name: "Coffee shop"
      })
    ).toHaveCount(1);
    await expect(
      page.getByText("Internal transfer · counted once")
    ).toBeVisible();
    await expect(
      movementLedger.getByText("Pending", { exact: false })
    ).toBeVisible();

    const disclosure = page.locator(".movement-ledger .movement-disclosure");
    await expect(disclosure).toHaveAccessibleName("View both transfer legs");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    const controlledId = await disclosure.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    await disclosure.focus();
    await expect(disclosure).toBeFocused();
    const target = await disclosure.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() =>
        disclosure.evaluate((element) => getComputedStyle(element).outlineStyle)
      )
      .not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(disclosure).toHaveAccessibleName("Hide both transfer legs");
    await expect(page.locator(`#${controlledId}`)).toBeVisible();
    const details = page.getByRole("region", { name: "Card payment" });
    await expect(details.getByText("Fixture checking · 1111")).toBeVisible();
    await expect(details.getByText("Fixture card · 2222")).toBeVisible();
    await expect(details.getByText("ACH PAYMENT CARD 2222")).toBeVisible();
    await expect(details.getByText("THANK YOU PAYMENT")).toBeVisible();
    await expect(details.getByText("September payment")).toBeVisible();
    await expect(details.getByText("REF-OUT")).toBeVisible();
    await expect(details.getByText("REF-IN")).toBeVisible();
    await expect(
      details.getByText(/Balance movement unavailable/)
    ).toBeVisible();
    await expect(details.getByText("Wrong match?")).toBeVisible();

    const legs = details.locator(".transfer-leg");
    await expect(legs).toHaveCount(2);
    const firstLeg = await legs.nth(0).boundingBox();
    const secondLeg = await legs.nth(1).boundingBox();
    if (testInfo.project.name === "mobile") {
      expect((secondLeg?.y ?? 0) > (firstLeg?.y ?? 0)).toBe(true);
    } else {
      expect(Math.abs((secondLeg?.y ?? 0) - (firstLeg?.y ?? 0))).toBeLessThan(
        8
      );
    }

    const untie = details.getByRole("button", { name: "Untie" });
    const untieTarget = await untie.boundingBox();
    expect(untieTarget?.height).toBeGreaterThanOrEqual(44);
    await untie.focus();
    await page.keyboard.press("Space");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Both unchanged source transactions are restored" })
    ).toBeAttached();
    await expect(page.getByText("3 movements")).toBeVisible();
    await expect(
      movementLedger.getByRole("heading", {
        level: 3,
        name: "Card payment"
      })
    ).toHaveCount(1);
    await expect(
      movementLedger.getByRole("heading", {
        level: 3,
        name: "THANK YOU PAYMENT"
      })
    ).toHaveCount(1);
    await expect(
      page.locator(`#movement-transaction-${outgoingId}`)
    ).toBeFocused();
    await expect(page.locator('[data-review-order="transfers"]')).toBeVisible();

    await prisma.transaction.updateMany({
      where: {
        id: {
          in: [outgoingId, incomingId, `${fixture}-coffee`]
        }
      },
      data: { categoryId }
    });
    await page.reload();
    await expect(page.locator('[data-review-order="transfers"]')).toBeVisible();
    await expect(page.locator('[data-review-order="categories"]')).toHaveCount(
      0
    );

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

test("category review supports grouped keyboard assignment and optional merchant rules", async ({
  page
}, testInfo) => {
  const fixture = `category-review-${testInfo.project.name}-${randomUUID()}`;
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
    const accountId = `${fixture}-account`;
    const groceryId = `${fixture}-grocery`;
    const coffeeId = `${fixture}-coffee`;
    const utilitiesId = `${fixture}-utilities`;
    const diningId = `${fixture}-dining`;
    const vacationId = `${fixture}-vacation`;
    const debtId = `${fixture}-debt`;

    await prisma.plaidItem.create({
      data: {
        id: itemId,
        householdId,
        linkedByUserId: userId,
        plaidItemId: `${fixture}-plaid-item`,
        accessTokenCiphertext: "fixture",
        accessTokenIv: "fixture",
        accessTokenTag: "fixture"
      }
    });
    await prisma.financialAccount.create({
      data: {
        id: accountId,
        householdId,
        plaidItemId: itemId,
        plaidAccountId: `${fixture}-plaid-account`,
        source: "PLAID",
        classification: "CASH",
        name: "Review checking",
        type: "depository"
      }
    });
    await prisma.category.createMany({
      data: [
        {
          id: utilitiesId,
          householdId,
          name: "Utilities",
          section: "Needs",
          sortOrder: 1
        },
        {
          id: diningId,
          householdId,
          name: "Dining",
          section: "Flex",
          sortOrder: 1
        },
        {
          id: vacationId,
          householdId,
          name: "Vacation",
          section: "Savings",
          sortOrder: 1
        },
        {
          id: debtId,
          householdId,
          name: "Card payment",
          section: "Debt",
          sortOrder: 1
        }
      ]
    });
    await prisma.transaction.createMany({
      data: [
        {
          id: groceryId,
          householdId,
          accountId,
          plaidTransactionId: `${fixture}-plaid-grocery`,
          name: "HARRIS TEETER 123",
          merchantName: "Harris Teeter",
          amount: "45.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-12T00:00:00.000Z")
        },
        {
          id: coffeeId,
          householdId,
          accountId,
          plaidTransactionId: `${fixture}-plaid-coffee`,
          name: "COFFEE SHOP 456",
          merchantName: "Coffee Shop",
          amount: "5.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-11T00:00:00.000Z")
        }
      ]
    });
    await prisma.merchantRule.create({
      data: {
        id: `${fixture}-existing-rule`,
        householdId,
        categoryId: utilitiesId,
        merchantKey: "harris teeter"
      }
    });

    await page.goto("/transactions");
    const panel = page.locator('[data-review-order="categories"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText("2 to review")).toBeVisible();
    const combobox = panel.getByRole("combobox", {
      name: "Search and choose a category"
    });
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    await expect(
      panel.getByRole("listbox", {
        name: "Categories grouped by budget section"
      })
    ).toBeVisible();
    for (const section of ["Needs", "Flex", "Savings", "Debt"]) {
      await expect(panel.getByRole("group", { name: section })).toBeVisible();
    }
    await expect(panel.getByText(/Existing rule: Utilities/)).toBeVisible();

    await combobox.focus();
    await combobox.fill("din");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(panel.getByText("Selected: Dining · Flex")).toBeVisible();
    const ruleCheckbox = panel.getByRole("checkbox", {
      name: /Use this category for future exact merchant matches/
    });
    await expect(ruleCheckbox).toBeChecked();
    await ruleCheckbox.uncheck();
    const assign = panel.getByRole("button", { name: "Assign category" });
    const target = await assign.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await assign.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Category assigned to Dining" })
    ).toBeAttached();
    await expect(panel.getByText("1 to review")).toBeVisible();
    await expect(
      panel.getByRole("combobox", {
        name: "Search and choose a category"
      })
    ).toBeFocused();
    await expect(
      page
        .locator(`#movement-transaction-${groceryId}`)
        .getByText("Dining", { exact: true })
    ).toBeVisible();
    await expect(
      prisma.merchantRule.findUnique({
        where: {
          householdId_merchantKey: {
            householdId,
            merchantKey: "harris teeter"
          }
        }
      })
    ).resolves.toBeNull();

    const nextCombobox = panel.getByRole("combobox", {
      name: "Search and choose a category"
    });
    await page.keyboard.press("Escape");
    await expect(nextCombobox).toHaveAttribute("aria-expanded", "false");
    await nextCombobox.fill("vac");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(panel.getByText("Selected: Vacation · Savings")).toBeVisible();
    const nextRule = panel.getByRole("checkbox", {
      name: /Use this category for future exact merchant matches/
    });
    await expect(nextRule).not.toBeChecked();
    await nextRule.check();
    await panel.getByRole("button", { name: "Assign category" }).focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("status").filter({ hasText: "Category review complete" })
    ).toBeAttached();
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Movement ledger" })
    ).toBeFocused();

    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: groceryId } })
    ).resolves.toMatchObject({ categoryId: diningId });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: coffeeId } })
    ).resolves.toMatchObject({ categoryId: vacationId });
    await expect(
      prisma.merchantRule.findUnique({
        where: {
          householdId_merchantKey: {
            householdId,
            merchantKey: "coffee shop"
          }
        }
      })
    ).resolves.toMatchObject({ categoryId: vacationId });

    await page.reload();
    await expect(page.locator('[data-review-order="categories"]')).toHaveCount(
      0
    );
    await expect(page.getByText("Dining", { exact: true })).toBeVisible();
    await expect(page.getByText("Vacation", { exact: true })).toBeVisible();
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

test("monthly budget reconciles real activity and copies the previous plan", async ({
  page
}, testInfo) => {
  const fixture = `budget-${testInfo.project.name}-${randomUUID()}`;
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
    const checkingId = `${fixture}-checking`;
    const cardId = `${fixture}-card`;
    const savingsId = `${fixture}-savings`;
    const needsId = `${fixture}-needs`;
    const flexId = `${fixture}-flex`;
    const debtId = `${fixture}-debt`;
    const savingsCategoryId = `${fixture}-savings-category`;
    const transferOutId = `${fixture}-transfer-out`;
    const transferInId = `${fixture}-transfer-in`;
    const savingsOutId = `${fixture}-savings-out`;
    const savingsInId = `${fixture}-savings-in`;

    await prisma.financialAccount.createMany({
      data: [
        {
          id: checkingId,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Budget checking",
          currentBalance: "900.00",
          isoCurrencyCode: "USD"
        },
        {
          id: cardId,
          householdId,
          source: "MANUAL",
          classification: "DEBT",
          name: "Budget card",
          mask: "4422",
          currentBalance: "-750.00",
          isoCurrencyCode: "USD"
        },
        {
          id: savingsId,
          householdId,
          source: "MANUAL",
          classification: "CASH",
          name: "Vacation savings",
          currentBalance: "500.00",
          isoCurrencyCode: "USD"
        }
      ]
    });
    await prisma.category.createMany({
      data: [
        {
          id: needsId,
          householdId,
          name: "Utilities",
          section: "Needs"
        },
        {
          id: flexId,
          householdId,
          name: "Dining",
          section: "Flex"
        },
        {
          id: savingsCategoryId,
          householdId,
          name: "Vacation",
          section: "Savings"
        },
        {
          id: debtId,
          householdId,
          name: "Card payment",
          section: "Debt"
        }
      ]
    });
    await prisma.budgetMonth.create({
      data: {
        id: `${fixture}-september`,
        householdId,
        month: new Date("2026-09-01T00:00:00.000Z"),
        income: "1000.00",
        allocations: {
          create: [
            {
              categoryId: debtId,
              planned: "300.00",
              destinationAccountId: cardId
            },
            {
              categoryId: savingsCategoryId,
              planned: "200.00",
              destinationAccountId: savingsId
            },
            { categoryId: needsId, planned: "200.00" },
            { categoryId: flexId, planned: "200.00" }
          ]
        }
      }
    });
    await prisma.transaction.createMany({
      data: [
        {
          id: `${fixture}-income`,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-income`,
          name: "PAYROLL",
          amount: "-1000.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-02T00:00:00.000Z")
        },
        {
          id: `${fixture}-needs-spend`,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-needs`,
          name: "UTILITY",
          amount: "100.00",
          isoCurrencyCode: "USD",
          categoryId: needsId,
          date: new Date("2026-09-03T00:00:00.000Z")
        },
        {
          id: `${fixture}-flex-spend`,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-flex`,
          name: "DINING",
          amount: "220.00",
          isoCurrencyCode: "USD",
          categoryId: flexId,
          date: new Date("2026-09-04T00:00:00.000Z")
        },
        {
          id: transferOutId,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-transfer-out`,
          name: "CARD PAYMENT",
          amount: "250.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-05T00:00:00.000Z")
        },
        {
          id: transferInId,
          householdId,
          accountId: cardId,
          plaidTransactionId: `${fixture}-plaid-transfer-in`,
          name: "PAYMENT RECEIVED",
          amount: "-250.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-06T00:00:00.000Z")
        },
        {
          id: savingsOutId,
          householdId,
          accountId: checkingId,
          plaidTransactionId: `${fixture}-plaid-savings-out`,
          name: "SAVINGS TRANSFER",
          amount: "100.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-07T00:00:00.000Z")
        },
        {
          id: savingsInId,
          householdId,
          accountId: savingsId,
          plaidTransactionId: `${fixture}-plaid-savings-in`,
          name: "SAVINGS DEPOSIT",
          amount: "-100.00",
          isoCurrencyCode: "USD",
          date: new Date("2026-09-08T00:00:00.000Z")
        }
      ]
    });
    await prisma.transferMatch.createMany({
      data: [
        {
          id: `${fixture}-card-match`,
          householdId,
          outgoingTransactionId: transferOutId,
          incomingTransactionId: transferInId
        },
        {
          id: `${fixture}-savings-match`,
          householdId,
          outgoingTransactionId: savingsOutId,
          incomingTransactionId: savingsInId
        }
      ]
    });

    await page.goto("/budget?month=2026-09");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "September 2026 plan"
      })
    ).toBeVisible();
    await expect(
      page.getByText("Received from unmatched USD inflows: $1,000.00")
    ).toBeVisible();
    await expect(
      page.locator(".page-header").getByText("$100.00", { exact: true })
    ).toBeVisible();
    const totals = page.locator(".budget-calculation-totals");
    await expect(totals.getByText("$250.00 moved · $50.00 due")).toBeVisible();
    await expect(totals.getByText("$100.00 moved · $100.00 due")).toBeVisible();
    await expect(totals.getByText("$100.00 paid · $100.00 due")).toBeVisible();
    await expect(totals.getByText("$220.00 spent · $20.00 over")).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Income plan 1000 dollars/ })
    ).toBeVisible();

    const nextMonth = page.getByRole("link", {
      name: "Next month, October 2026"
    });
    expect((await nextMonth.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await nextMonth.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/month=2026-10/);
    await expect(
      page.getByRole("heading", { name: "No plan for October 2026" })
    ).toBeVisible();

    const copy = page.getByRole("button", {
      name: "Copy September 2026 plan"
    });
    expect((await copy.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await copy.focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("status").filter({ hasText: "October 2026 budget copied" })
    ).toBeAttached();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "October 2026 plan"
      })
    ).toBeVisible();
    await expect(page.locator("#budget-summary-title")).toBeFocused();
    await expect(
      prisma.budgetAllocation.count({
        where: {
          budgetMonth: {
            householdId,
            month: new Date("2026-10-01T00:00:00.000Z")
          }
        }
      })
    ).resolves.toBe(4);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "October 2026 plan" })
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

test("a local owner can add and use a passkey and recovery code", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Chromium CDP is required");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });

  await page.goto("/sign-in");
  await page
    .getByLabel("Development email")
    .fill("passkey-owner@currents.local");
  await page.getByRole("button", { name: "Local development sign-in" }).click();
  await page.getByRole("link", { name: "Security" }).click();

  await page.getByLabel("New passkey name").fill("Playwright passkey");
  await page.getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByText("Passkey added.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Generate new recovery codes" })
    .click();
  const firstRecoveryCode = await page
    .getByRole("list", { name: "New recovery codes" })
    .getByRole("listitem")
    .first()
    .textContent();
  expect(firstRecoveryCode).toBeTruthy();

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/accounts$/);

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByText("Use a recovery code").click();
  await page
    .getByLabel("One-time recovery code")
    .fill(firstRecoveryCode?.trim() ?? "");
  await page
    .getByRole("button", { name: "Sign in with recovery code" })
    .click();
  await expect(page).toHaveURL(/\/settings\/security$/);
});
