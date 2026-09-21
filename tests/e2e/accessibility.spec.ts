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
