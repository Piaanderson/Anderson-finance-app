import { describe, expect, it } from "vitest";
import {
  deriveNetWorthHistory,
  derivePropertyEquity,
  eightMonthWindowStart,
  ledgerEquationAmount,
  ledgerEquationCurrencies,
  ledgerEquationHasSource,
  summarizeAccountLedger
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
      currency: "USD",
      propertyAmount: "412000.10",
      debtAmount: "-288400.10",
      isUnderwater: false
    });
  });

  it("marks negative property equity without clamping the authoritative amount", () => {
    expect(
      derivePropertyEquity({ currentBalance: "200000.00", currency: "USD" }, [
        { currentBalance: "-287400.05", currency: "USD" }
      ])
    ).toEqual({
      status: "available",
      amount: "-87400.05",
      currency: "USD",
      propertyAmount: "200000.00",
      debtAmount: "-287400.05",
      isUnderwater: true
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

  it("keeps linked source records traceable while avoiding visual double counting", () => {
    const ledger = summarizeAccountLedger(
      [
        {
          id: "cash",
          classification: "CASH",
          currentBalance: "57455.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "invested",
          classification: "INVESTED",
          currentBalance: "18920.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "home",
          classification: "PROPERTY",
          currentBalance: "412000.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "mortgage",
          classification: "DEBT",
          currentBalance: "-287400.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "other-debt",
          classification: "DEBT",
          currentBalance: "-23115.00",
          isoCurrencyCode: "USD",
          isActive: true
        }
      ],
      [
        {
          property: { id: "home" },
          debts: [{ id: "mortgage" }],
          equity: {
            status: "available",
            amount: "124600.00",
            currency: "USD",
            propertyAmount: "412000.00",
            debtAmount: "-287400.00",
            isUnderwater: false
          }
        }
      ]
    );

    expect(ledger.linkedDebtAccountIds).toEqual(["mortgage"]);
    expect(ledger.summary.totalsByClassification.PROPERTY).toEqual([
      { currency: "USD", amount: "124600.00" }
    ]);
    expect(ledger.summary.totalsByClassification.DEBT).toEqual([
      { currency: "USD", amount: "-23115.00" }
    ]);
    expect(ledger.summary.totals).toEqual([
      { currency: "USD", amount: "177860.00" }
    ]);
  });

  it("keeps malformed duplicate debt links in the raw equation exactly once", () => {
    const ledger = summarizeAccountLedger(
      [
        {
          id: "cash",
          classification: "CASH",
          currentBalance: "100.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "home-one",
          classification: "PROPERTY",
          currentBalance: "400.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "home-two",
          classification: "PROPERTY",
          currentBalance: "300.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "mortgage",
          classification: "DEBT",
          currentBalance: "-500.00",
          isoCurrencyCode: "USD",
          isActive: true
        }
      ],
      ["home-one", "home-two"].map((id) => ({
        property: { id },
        debts: [{ id: "mortgage" }],
        combineInLedger: false,
        equity: {
          status: "unavailable" as const,
          reason: "Debt is linked to multiple properties."
        }
      }))
    );

    expect(ledger.linkedDebtAccountIds).toEqual([]);
    expect(ledger.ambiguousLinkedDebtAccountIds).toEqual(["mortgage"]);
    expect(ledger.summary.totalsByClassification.PROPERTY).toEqual([
      { currency: "USD", amount: "700.00" }
    ]);
    expect(ledger.summary.totalsByClassification.DEBT).toEqual([
      { currency: "USD", amount: "-500.00" }
    ]);
    expect(ledger.summary.totals).toEqual([
      { currency: "USD", amount: "300.00" }
    ]);
  });

  it("keeps mixed-currency and missing linked balances as raw source positions", () => {
    const positions = [
      {
        id: "home",
        classification: "PROPERTY" as const,
        currentBalance: "400.00",
        isoCurrencyCode: "USD",
        isActive: true
      },
      {
        id: "cad-mortgage",
        classification: "DEBT" as const,
        currentBalance: "-200.00",
        isoCurrencyCode: "CAD",
        isActive: true
      },
      {
        id: "missing-mortgage",
        classification: "DEBT" as const,
        currentBalance: null,
        isoCurrencyCode: "USD",
        isActive: true
      }
    ];
    const ledger = summarizeAccountLedger(positions, [
      {
        property: { id: "home" },
        debts: [{ id: "cad-mortgage" }, { id: "missing-mortgage" }],
        equity: {
          status: "unavailable",
          reason: "Linked balances are missing or use different currencies."
        }
      }
    ]);
    const sources = positions.map((position) => ({
      id: position.id,
      classification: position.classification,
      currency: position.isoCurrencyCode
    }));

    expect(ledger.linkedDebtAccountIds).toEqual([]);
    expect(ledger.uncombinedLinkedDebtAccountIds).toEqual([
      "cad-mortgage",
      "missing-mortgage"
    ]);
    expect(ledger.summary.totals).toEqual([
      { currency: "CAD", amount: "-200.00" },
      { currency: "USD", amount: "400.00" }
    ]);
    expect(ledgerEquationAmount(ledger.summary, sources, "DEBT", "CAD")).toBe(
      "-200.00"
    );
    expect(
      ledgerEquationAmount(ledger.summary, sources, "DEBT", "USD")
    ).toBeNull();
  });

  it("distinguishes a known empty equation term from an unavailable position", () => {
    const ledger = summarizeAccountLedger(
      [
        {
          id: "cash",
          classification: "CASH",
          currentBalance: "100.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "property",
          classification: "PROPERTY",
          currentBalance: null,
          isoCurrencyCode: "USD",
          isActive: true
        }
      ],
      []
    );
    const sources = [
      { id: "cash", classification: "CASH" as const, currency: "USD" },
      {
        id: "property",
        classification: "PROPERTY" as const,
        currency: "USD"
      }
    ];

    expect(
      ledgerEquationAmount(ledger.summary, sources, "INVESTED", "USD")
    ).toBe("0.00");
    expect(
      ledgerEquationAmount(ledger.summary, sources, "PROPERTY", "USD")
    ).toBeNull();
  });

  it("keeps a missing CAD position in the equation beside USD", () => {
    const sources = [
      { id: "cash", classification: "CASH" as const, currency: "USD" },
      {
        id: "investment-cad",
        classification: "INVESTED" as const,
        currency: "CAD"
      }
    ];
    const ledger = summarizeAccountLedger(
      [
        {
          id: "cash",
          classification: "CASH",
          currentBalance: "100.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "investment-cad",
          classification: "INVESTED",
          currentBalance: null,
          isoCurrencyCode: "CAD",
          isActive: true
        }
      ],
      []
    );

    expect(ledgerEquationCurrencies(sources)).toEqual(["CAD", "USD"]);
    expect(
      ledgerEquationAmount(ledger.summary, sources, "INVESTED", "CAD")
    ).toBeNull();
  });

  it("renders a missing CAD unclassified source as unavailable", () => {
    const sources = [
      { id: "cash", classification: "CASH" as const, currency: "USD" },
      {
        id: "unclassified-cad",
        classification: "UNCLASSIFIED" as const,
        currency: "CAD"
      }
    ];
    const ledger = summarizeAccountLedger(
      [
        {
          id: "cash",
          classification: "CASH",
          currentBalance: "100.00",
          isoCurrencyCode: "USD",
          isActive: true
        },
        {
          id: "unclassified-cad",
          classification: "UNCLASSIFIED",
          currentBalance: null,
          isoCurrencyCode: "CAD",
          isActive: true
        }
      ],
      []
    );

    expect(ledgerEquationHasSource(sources, "UNCLASSIFIED", "CAD")).toBe(true);
    expect(
      ledgerEquationAmount(ledger.summary, sources, "UNCLASSIFIED", "CAD")
    ).toBeNull();
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
