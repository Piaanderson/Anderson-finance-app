import { describe, expect, it } from "vitest";
import { summarizePositions } from "./position-summary";

describe("household position summary", () => {
  it("reconciles all four signed classifications in one currency", () => {
    const summary = summarizePositions([
      {
        id: "cash",
        classification: "CASH",
        currentBalance: 1250,
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "invested",
        classification: "INVESTED",
        currentBalance: 5000,
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "property",
        classification: "PROPERTY",
        currentBalance: 300000,
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "debt",
        classification: "DEBT",
        currentBalance: -205000,
        isoCurrencyCode: "USD",
        isActive: true
      }
    ]);

    expect(summary.totals).toEqual([{ currency: "USD", amount: 101250 }]);
    expect(summary.totalsByClassification.DEBT).toEqual([
      { currency: "USD", amount: -205000 }
    ]);
    expect(summary.isComplete).toBe(true);
  });

  it("keeps currencies separate and excludes archived positions", () => {
    const summary = summarizePositions([
      {
        id: "usd",
        classification: "CASH",
        currentBalance: 100,
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "cad",
        classification: "CASH",
        currentBalance: 100,
        isoCurrencyCode: "CAD",
        isActive: true
      },
      {
        id: "archived",
        classification: "DEBT",
        currentBalance: -1000,
        isoCurrencyCode: "USD",
        isActive: false
      }
    ]);

    expect(summary.totals).toEqual([
      { currency: "CAD", amount: 100 },
      { currency: "USD", amount: 100 }
    ]);
    expect(summary.accountCount).toBe(2);
  });

  it("reports missing positions and currencies without treating them as zero", () => {
    const summary = summarizePositions([
      {
        id: "missing-balance",
        classification: "CASH",
        currentBalance: null,
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "missing-currency",
        classification: "INVESTED",
        currentBalance: 50,
        isoCurrencyCode: null,
        isActive: true
      }
    ]);

    expect(summary.totals).toEqual([]);
    expect(summary.missingBalanceAccountIds).toEqual(["missing-balance"]);
    expect(summary.missingCurrencyAccountIds).toEqual(["missing-currency"]);
    expect(summary.isComplete).toBe(false);
  });
});
