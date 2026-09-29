import { describe, expect, it } from "vitest";
import { PlaidEnvironments } from "plaid";
import {
  contentSecurityPolicy,
  sanitizeRequestPath,
  securityHeaderList
} from "./security-headers";
import { resolvePlaidEnvironment } from "@/server/plaid/client";

describe("security headers", () => {
  it("sets WCAG-adjacent browser isolation headers and a Plaid-aware CSP", () => {
    const keys = securityHeaderList("production").map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Frame-Options",
        "X-Content-Type-Options"
      ])
    );
    const productionPolicy = contentSecurityPolicy("production", "sandbox");
    expect(productionPolicy).toContain("https://cdn.plaid.com");
    expect(productionPolicy).toContain("'unsafe-inline'");
    expect(productionPolicy).not.toContain("unsafe-eval");
    expect(productionPolicy).toContain("frame-src https://cdn.plaid.com");
    expect(productionPolicy).not.toContain(
      "frame-src https://cdn.plaid.com https://"
    );
    expect(productionPolicy).toContain("https://sandbox.plaid.com");
    expect(productionPolicy).not.toContain("https://development.plaid.com");
    expect(productionPolicy).not.toContain("https://production.plaid.com");
    expect(productionPolicy).not.toContain("*.plaid.com");
    expect(contentSecurityPolicy("development", "development")).toContain(
      "connect-src 'self' https://development.plaid.com"
    );
    expect(contentSecurityPolicy("development", "development")).toContain(
      "unsafe-eval"
    );
    expect(contentSecurityPolicy("production", "production")).toContain(
      "connect-src 'self' https://production.plaid.com"
    );
    expect(() => contentSecurityPolicy("production", "sandbox-live")).toThrow(
      /PLAID_ENV/
    );
    expect(sanitizeRequestPath("/sign-in?code=secret")).toBe("/sign-in");
  });
});

describe("Plaid environment mapping", () => {
  it("accepts Sandbox, Trial/development, and Production hosts only", () => {
    expect(PlaidEnvironments[resolvePlaidEnvironment("sandbox")]).toBe(
      PlaidEnvironments.sandbox
    );
    expect(PlaidEnvironments[resolvePlaidEnvironment("development")]).toBe(
      PlaidEnvironments.development
    );
    expect(PlaidEnvironments[resolvePlaidEnvironment("production")]).toBe(
      PlaidEnvironments.production
    );
    expect(() => resolvePlaidEnvironment("sandbox-live")).toThrow(/PLAID_ENV/);
  });
});
