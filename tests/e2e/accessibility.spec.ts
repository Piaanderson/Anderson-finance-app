import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sign-in surface has no automatically detectable WCAG violations", async ({
  page
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your money, in motion." })
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
