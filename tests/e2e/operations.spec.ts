import { expect, test } from "@playwright/test";

test("health stays public and security headers are present", async ({
  request
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"] ?? "").toContain(
    "cdn.plaid.com"
  );
  expect(response.headers()["content-security-policy"] ?? "").not.toContain(
    "plaid-secret"
  );
});
