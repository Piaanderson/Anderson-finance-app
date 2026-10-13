import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { prisma } from "../../src/server/db";

test.skip(
  process.env.ACCOUNTS_BEFORE_EVIDENCE !== "true",
  "Run only when reconstructing issue #28 main-branch evidence."
);

test("captures the pre-parity Accounts screen from main", async ({ page }) => {
  const fixture = `accounts-before-${randomUUID()}`;
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
    const itemId = `${fixture}-item`;
    const ids = {
      cash: `${fixture}-cash`,
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
          id: ids.cash,
          householdId,
          plaidItemId: itemId,
          plaidAccountId: `${fixture}-cash`,
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
          id: ids.invested,
          householdId,
          source: "MANUAL",
          classification: "INVESTED",
          name: "Manual Roth",
          currentBalance: "200.20",
          isoCurrencyCode: "USD"
        },
        {
          id: ids.property,
          householdId,
          source: "MANUAL",
          classification: "PROPERTY",
          name: "Primary home",
          currentBalance: "1000.30",
          isoCurrencyCode: "USD"
        },
        {
          id: ids.debt,
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
        propertyAccountId: ids.property,
        debtAccountId: ids.debt
      }
    });

    await page.reload();
    await expect(page.getByText(/signed current positions/)).toBeVisible();
    await page
      .getByRole("article", { name: "Fixture checking" })
      .locator("summary")
      .first()
      .click();
    await page
      .getByRole("article", { name: "Primary home" })
      .locator("summary")
      .first()
      .click();

    const directory = process.env.ACCOUNTS_EVIDENCE_DIR!;
    await mkdir(directory, { recursive: true });
    for (const width of [1280, 1920, 512, 390]) {
      await page.setViewportSize({
        width,
        height: width >= 1280 ? 900 : 844
      });
      await page.screenshot({
        path: join(directory, `before-${width}.png`),
        fullPage: true
      });
    }
  } finally {
    if (householdId) {
      await prisma.household.deleteMany({ where: { id: householdId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});
