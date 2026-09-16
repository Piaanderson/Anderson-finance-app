import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
