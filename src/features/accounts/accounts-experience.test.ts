import { describe, expect, it } from "vitest";
import {
  deriveNetWorthHistory,
  derivePropertyEquity,
  eightMonthWindowStart
} from "./accounts-experience";

const observedAt = new Date("2026-09-20T18:00:00.000Z");

describe("Accounts experience arithmetic", () => {
  it("derives property equity from compatible separate signed records", () => {
    expect(
      derivePropertyEquity({ currentBalance: "412000.10", currency: "USD" }, [
        { currentBalance: "-287400.05", currency: "USD" },
        { currentBalance: "-1000.05", currency: "USD" }
      ])
    ).toEqual({
      status: "available",
      amount: "123600.00",
      currency: "USD"
    });
  });

  it("does not derive equity across missing or unlike currencies", () => {
    expect(
      derivePropertyEquity({ currentBalance: "400000.00", currency: "USD" }, [
        { currentBalance: "-200000.00", currency: "CAD" }
      ])
    ).toMatchObject({ status: "unavailable" });
    expect(
      derivePropertyEquity({ currentBalance: null, currency: "USD" }, [])
    ).toMatchObject({ status: "unavailable" });
  });

  it("derives exact net-worth points only at real snapshot observations", () => {
    const history = deriveNetWorthHistory(
      ["cash", "debt"],
      [
        {
          accountId: "cash",
          signedBalance: "100.10",
          isoCurrencyCode: "USD",
          effectiveAt: new Date("2026-01-10T12:00:00.000Z"),
          observedAt
        },
        {
          accountId: "debt",
          signedBalance: "-20.05",
          isoCurrencyCode: "USD",
          effectiveAt: new Date("2026-01-10T12:00:00.000Z"),
          observedAt
        },
        {
          accountId: "cash",
          signedBalance: "110.20",
          isoCurrencyCode: "USD",
          effectiveAt: new Date("2026-03-10T12:00:00.000Z"),
          observedAt
        },
        {
          accountId: "debt",
          signedBalance: "-10.15",
          isoCurrencyCode: "USD",
          effectiveAt: new Date("2026-04-10T12:00:00.000Z"),
          observedAt
        }
      ],
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-09-30T23:59:59.999Z")
    );

    expect(history).toMatchObject({
      status: "available",
      currency: "USD",
      points: [
        { amount: "90.15", currency: "USD" },
        { amount: "100.05", currency: "USD" }
      ]
    });
  });

  it("reports history unavailable rather than filling gaps or converting currency", () => {
    expect(
      deriveNetWorthHistory(
        ["cash", "missing"],
        [
          {
            accountId: "cash",
            signedBalance: "100.00",
            isoCurrencyCode: "USD",
            effectiveAt: new Date("2026-03-10T12:00:00.000Z"),
            observedAt
          }
        ],
        new Date("2026-02-01T00:00:00.000Z"),
        new Date("2026-09-30T23:59:59.999Z")
      )
    ).toMatchObject({ status: "unavailable", points: [] });

    expect(
      deriveNetWorthHistory(
        ["cash", "cad"],
        [
          {
            accountId: "cash",
            signedBalance: "100.00",
            isoCurrencyCode: "USD",
            effectiveAt: new Date("2026-03-10T12:00:00.000Z"),
            observedAt
          },
          {
            accountId: "cad",
            signedBalance: "100.00",
            isoCurrencyCode: "CAD",
            effectiveAt: new Date("2026-03-10T12:00:00.000Z"),
            observedAt
          }
        ],
        new Date("2026-02-01T00:00:00.000Z"),
        new Date("2026-09-30T23:59:59.999Z")
      )
    ).toMatchObject({ status: "unavailable", points: [] });
  });

  it("starts an eight-month inclusive window seven months earlier", () => {
    expect(eightMonthWindowStart(new Date("2026-09-26T21:00:00.000Z"))).toEqual(
      new Date("2026-02-01T00:00:00.000Z")
    );
  });
});
