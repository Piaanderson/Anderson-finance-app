import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../src/server/db";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const privateRoutes = [
  { path: "/dashboard", heading: "Home", title: "Home · Currents" },
  { path: "/budget", heading: "Budget", title: "Budget · Currents" },
  { path: "/accounts", heading: "Accounts", title: "Accounts · Currents" },
  {
    path: "/transactions",
    heading: "Transactions",
    title: "Transactions · Currents"
  },
  {
    path: "/categories",
    heading: "Categories",
    title: "Categories · Currents"
  },
  {
    path: "/settings/security",
    heading: "Security",
    title: "Security · Currents"
  }
] as const;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Development email").fill(email);
  await page.getByRole("button", { name: "Local development sign-in" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const membership = await prisma.householdMember.findFirstOrThrow({
    where: { userId: user.id }
  });
  return { userId: user.id, householdId: membership.householdId };
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations).toEqual([]);
}

async function expectHeadingStructure(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  const levels = await page
    .locator(
      "main h1:visible, main h2:visible, main h3:visible, main h4:visible"
    )
    .evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1)))
    );
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(
      levels[index]! - levels[index - 1]!,
      `Heading level jumped from h${levels[index - 1]} to h${levels[index]}`
    ).toBeLessThanOrEqual(1);
  }
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

async function expectTouchTargets(page: Page) {
  const undersized = await page.evaluate(() => {
    const selectors = [
      "a[href]",
      "button:not([disabled])",
      "input:not([type='hidden']):not([disabled])",
      "select:not([disabled])",
      "summary",
      "[role='option']"
    ].join(",");
    return [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((element) => {
        const input = element as HTMLInputElement;
        const target =
          input.matches("input[type='checkbox'], input[type='radio']") &&
          input.closest("label")
            ? (input.closest("label") as HTMLElement)
            : element;
        const rect = target.getBoundingClientRect();
        return {
          name:
            target.getAttribute("aria-label") ||
            target.textContent?.trim() ||
            input.name ||
            element.tagName,
          width: rect.width,
          height: rect.height
        };
      })
      .filter((target) => target.width < 44 || target.height < 44);
  });
  expect(undersized).toEqual([]);
}

async function expectReducedMotion(page: Page) {
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const durations = [
          ...style.animationDuration.split(","),
          ...style.transitionDuration.split(",")
        ].map((value) =>
          value.trim().endsWith("ms")
            ? Number.parseFloat(value)
            : Number.parseFloat(value) * 1000
        );
        return durations.some((duration) => duration > 0.02);
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        animationDuration: getComputedStyle(element).animationDuration,
        transitionDuration: getComputedStyle(element).transitionDuration
      }))
  );
  expect(animated).toEqual([]);
}

async function captureAuditScreenshot(
  page: Page,
  projectName: string,
  width: number
) {
  if (process.env.PHASE7_SCREENSHOTS !== "true") return;
  const requestedWidths = process.env.PHASE7_SCREENSHOT_WIDTHS?.split(",").map(
    (value) => Number.parseInt(value.trim(), 10)
  );
  if (requestedWidths?.length && !requestedWidths.includes(width)) return;

  const directory = process.env.PHASE7_SCREENSHOT_DIR ?? "/tmp";
  const stage = process.env.PHASE7_SCREENSHOT_STAGE;
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: join(
      directory,
      `currents-phase7-${stage ? `${stage}-` : ""}${projectName}-${width}.png`
    ),
    fullPage: true
  });
}

test("shared Nocturne primitives preserve accessible production treatments", async ({
  page
}) => {
  await page.goto("/sign-in");

  const tokens = await page.locator("html").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      colorScheme: style.colorScheme,
      space1: style.getPropertyValue("--space-1").trim(),
      space2: style.getPropertyValue("--space-2").trim(),
      space3: style.getPropertyValue("--space-3").trim(),
      space4: style.getPropertyValue("--space-4").trim(),
      space6: style.getPropertyValue("--space-6").trim(),
      space8: style.getPropertyValue("--space-8").trim()
    };
  });
  expect(tokens).toEqual({
    colorScheme: "dark",
    space1: "2.8px",
    space2: "5.6px",
    space3: "8.4px",
    space4: "11.2px",
    space6: "16.8px",
    space8: "22.4px"
  });

  const card = page.locator(".auth-card");
  const cardStyles = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius
    };
  });
  expect(cardStyles).toEqual({
    backgroundColor: "rgb(35, 37, 50)",
    borderRadius: "8px"
  });

  const input = page.getByLabel("Development email");
  const inputStyles = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderColor: style.borderColor,
      fontSize: style.fontSize,
      height: element.getBoundingClientRect().height
    };
  });
  expect(inputStyles.borderColor).toBe("rgb(117, 121, 140)");
  expect(inputStyles.fontSize).toBe("16px");
  expect(inputStyles.height).toBeGreaterThanOrEqual(44);

  await input.hover();
  await expect
    .poll(() =>
      input.evaluate((element) => getComputedStyle(element).borderColor)
    )
    .toBe("rgb(178, 182, 202)");
  await input.focus();
  await expect
    .poll(() =>
      input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderColor: style.borderColor,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth
        };
      })
    )
    .toEqual({
      borderColor: "rgb(145, 132, 217)",
      outlineColor: "rgb(145, 132, 217)",
      outlineStyle: "solid",
      outlineWidth: "2px"
    });

  const primaryButton = page.getByRole("button", {
    name: "Sign in with a passkey"
  });
  const primaryStyles = await primaryButton.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      borderColor: style.borderColor,
      color: style.color,
      height: rect.height,
      width: rect.width
    };
  });
  expect(primaryStyles.borderColor).toBe("rgb(145, 132, 217)");
  expect(primaryStyles.color).toBe("rgb(145, 132, 217)");
  expect(primaryStyles.height).toBeGreaterThanOrEqual(44);
  expect(primaryStyles.width).toBeGreaterThanOrEqual(44);

  await primaryButton.evaluate((element) => {
    (element as HTMLButtonElement).disabled = true;
  });
  await expect
    .poll(() =>
      primaryButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderColor: style.borderColor,
          color: style.color,
          cursor: style.cursor,
          opacity: style.opacity
        };
      })
    )
    .toEqual({
      borderColor: "rgb(89, 93, 108)",
      color: "rgb(147, 151, 171)",
      cursor: "not-allowed",
      opacity: "1"
    });
});

test("public authentication routes expose associated errors and WCAG semantics", async ({
  page
}, testInfo) => {
  const plaidRequests: string[] = [];
  page.on("request", (request) => {
    if (/plaid\.(com|net)/i.test(new URL(request.url()).hostname)) {
      plaidRequests.push(request.url());
    }
  });

  await page.goto("/sign-in");
  await expectHeadingStructure(page);
  await expect(page).toHaveTitle("Sign in · Currents");
  if (testInfo.project.name === "chromium") {
    await page.route("**/api/auth/callback/recovery-code**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          url: `${new URL(page.url()).origin}/sign-in?error=CredentialsSignin`
        })
      });
    });
    await page.getByText("Use a recovery code").click();
    const recoveryCode = page.getByLabel("One-time recovery code");
    await recoveryCode.fill("not-a-valid-code");
    await page
      .getByRole("button", { name: "Sign in with recovery code" })
      .click();
    const error = page.locator("#sign-in-error");
    await expect(error).toContainText("invalid or has already been used");
    await expect(recoveryCode).toHaveAttribute("aria-invalid", "true");
    await expect(recoveryCode).toHaveAttribute(
      "aria-describedby",
      /sign-in-error/
    );
    await expect
      .poll(() =>
        recoveryCode.evaluate(
          (element) => getComputedStyle(element).borderColor
        )
      )
      .toBe("rgb(255, 143, 135)");
    await expect
      .poll(() =>
        error.evaluate((element) => ({
          color: getComputedStyle(element).color,
          fontWeight: getComputedStyle(element).fontWeight
        }))
      )
      .toEqual({
        color: "rgb(255, 143, 135)",
        fontWeight: "500"
      });
  }
  await expectNoAxeViolations(page);

  await page.goto("/setup");
  await expectHeadingStructure(page);
  await expect(page).toHaveTitle("Set up owner · Currents");
  await expectNoAxeViolations(page);
  expect(plaidRequests).toEqual([]);
});

test("every authenticated route passes axe, title, heading, and skip-link checks", async ({
  page
}, testInfo) => {
  const fixture = `phase7-routes-${testInfo.project.name}-${randomUUID()}`;
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
    ({ householdId, userId } = await signIn(page, email));
    await page.goto("/dashboard");
    await expect(page.locator(".route-loading")).toHaveCount(0);
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect
      .poll(() =>
        skipLink.evaluate((element) => getComputedStyle(element).outlineStyle)
      )
      .not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    for (const route of privateRoutes) {
      await page.goto(route.path);
      await expect(page.locator(".route-loading")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveText(route.heading);
      await expect(page).toHaveTitle(route.title);
      await expectHeadingStructure(page);
      await expectNoAxeViolations(page);
      await expectNoHorizontalPageOverflow(page);
    }
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

test("all routes reflow, preserve touch targets, and disable nonessential motion", async ({
  page
}, testInfo) => {
  const fixture = `phase7-reflow-${testInfo.project.name}-${randomUUID()}`;
  const email = `${fixture}@example.test`;
  const widths =
    testInfo.project.name === "mobile"
      ? [320, 375, 390, 412]
      : [512, 768, 1024, 1280, 1440, 1920];
  const plaidRequests: string[] = [];
  let householdId: string | null = null;
  let userId: string | null = null;
  page.on("request", (request) => {
    if (/plaid\.(com|net)/i.test(new URL(request.url()).hostname)) {
      plaidRequests.push(request.url());
    }
  });

  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 780 : 1000 });
      for (const route of ["/sign-in", "/setup"]) {
        await page.goto(route);
        await expectNoHorizontalPageOverflow(page);
        await expectTouchTargets(page);
      }
    }

    ({ householdId, userId } = await signIn(page, email));
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 780 : 1000 });
      for (const route of privateRoutes) {
        await page.goto(route.path);
        await expect(page.locator(".route-loading")).toHaveCount(0);
        await expect(page.locator("h1")).toHaveText(route.heading);
        await expectNoHorizontalPageOverflow(page);
        await expectTouchTargets(page);
        if (route.path === "/dashboard") {
          await captureAuditScreenshot(page, testInfo.project.name, width);
        }
        if (width < 600) {
          await page.evaluate(() =>
            window.scrollTo({ top: document.documentElement.scrollHeight })
          );
          const overlap = await page.evaluate(() => {
            const navigation = document.querySelector(".sidebar");
            const lastContent = document.querySelector(
              ".page-content > :last-child"
            );
            if (!navigation || !lastContent) return null;
            return (
              lastContent.getBoundingClientRect().bottom -
              navigation.getBoundingClientRect().top
            );
          });
          expect(overlap ?? 0).toBeLessThanOrEqual(1);
        }
      }
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of privateRoutes) {
      await page.goto(route.path);
      await expect(page.locator(".route-loading")).toHaveCount(0);
      await expectReducedMotion(page);
    }
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
