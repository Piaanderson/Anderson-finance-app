import { describe, expect, it } from "vitest";
import {
  buildTransferSuggestions,
  evaluateTransferPair,
  fixedPointMinorUnits,
  TRANSFER_DATE_WINDOW_DAYS,
  type TransferPolicyTransaction
} from "./transfer-suggestions";

const householdId = "household-a";

function transaction(
  id: string,
  overrides: Partial<TransferPolicyTransaction> = {}
): TransferPolicyTransaction {
  return {
    id,
    householdId,
    accountId: `${id}-account`,
    accountName: `${id} account`,
    accountMask: "1234",
    name: id,
    merchantName: null,
    bankDescription: null,
    paymentMemo: null,
    referenceNumber: null,
    paymentChannel: null,
    transactionCode: null,
    checkNumber: null,
    amount: "100.00",
    isoCurrencyCode: "USD",
    unofficialCurrencyCode: null,
    date: new Date("2026-09-10T20:00:00.000Z"),
    authorizedDate: null,
    pending: false,
    removedAt: null,
    matched: false,
    ...overrides
  };
}

describe("transfer suggestion eligibility", () => {
  it("uses integer minor units without floating-point comparison", () => {
    expect(fixedPointMinorUnits("0.10")).toBe(10n);
    expect(fixedPointMinorUnits("-90071992547409.91")).toBe(-9007199254740991n);
    expect(() => fixedPointMinorUnits("10.001")).toThrow(
      "Invalid fixed-point amount"
    );

    expect(
      evaluateTransferPair(
        transaction("out", { amount: "90071992547409.91" }),
        transaction("in", { amount: "-90071992547409.91" })
      ).eligible
    ).toBe(true);
  });

  it("requires different accounts, opposite signs, and exact amounts", () => {
    const outgoing = transaction("out");
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("same-account", {
          accountId: outgoing.accountId,
          amount: "-100.00"
        })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Transfer legs must use different accounts."
      ])
    });
    expect(
      evaluateTransferPair(outgoing, transaction("wrong-sign"))
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "The outgoing leg must be positive and the incoming leg negative."
      ])
    });
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("wrong-amount", { amount: "-100.01" })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Transfer legs must have exactly equal absolute amounts."
      ])
    });
  });

  it("matches only identical known currency identities", () => {
    const outgoing = transaction("out");
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("eur", { amount: "-100.00", isoCurrencyCode: "EUR" })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Transfer legs must use the same currency identity."
      ])
    });
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("unofficial", {
          amount: "-100.00",
          isoCurrencyCode: null,
          unofficialCurrencyCode: "USD"
        })
      )
    ).toMatchObject({ eligible: false });
    expect(
      evaluateTransferPair(
        transaction("btc-out", {
          isoCurrencyCode: null,
          unofficialCurrencyCode: "BTC"
        }),
        transaction("btc-in", {
          amount: "-100.00",
          isoCurrencyCode: null,
          unofficialCurrencyCode: "btc"
        })
      )
    ).toMatchObject({
      eligible: true,
      currency: { kind: "UNOFFICIAL", code: "BTC" }
    });
    expect(
      evaluateTransferPair(
        transaction("unknown-out", { isoCurrencyCode: null }),
        transaction("unknown-in", {
          amount: "-100.00",
          isoCurrencyCode: null
        })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Both legs must have one known currency identity."
      ])
    });
  });

  it("uses authorized date with posted fallback and an inclusive seven-day window", () => {
    const outgoing = transaction("out", {
      authorizedDate: new Date("2026-09-01T23:30:00.000Z"),
      date: new Date("2026-09-20T00:00:00.000Z")
    });
    const boundary = transaction("boundary", {
      amount: "-100.00",
      date: new Date("2026-09-08T01:00:00.000Z")
    });
    expect(evaluateTransferPair(outgoing, boundary)).toMatchObject({
      eligible: true,
      dateDistanceDays: TRANSFER_DATE_WINDOW_DAYS
    });
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("outside", {
          amount: "-100.00",
          date: new Date("2026-09-09T00:00:00.000Z")
        })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Transfer legs must be within 7 calendar days."
      ])
    });
    expect(
      evaluateTransferPair(
        outgoing,
        transaction("invalid-date", {
          amount: "-100.00",
          date: new Date("invalid")
        })
      )
    ).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        "Both legs must have valid effective dates."
      ])
    });
  });

  it("excludes pending, removed, and already matched transactions", () => {
    const outgoing = transaction("out");
    for (const incoming of [
      transaction("pending", { amount: "-100.00", pending: true }),
      transaction("removed", {
        amount: "-100.00",
        removedAt: new Date()
      }),
      transaction("matched", { amount: "-100.00", matched: true })
    ]) {
      expect(evaluateTransferPair(outgoing, incoming).eligible).toBe(false);
    }
  });
});

describe("transfer suggestion ranking", () => {
  it("ranks by date first and description wording only as supporting evidence", () => {
    const suggestions = buildTransferSuggestions({
      householdId,
      transactions: [
        transaction("out", {
          bankDescription: "Ordinary debit",
          date: new Date("2026-09-10T00:00:00.000Z")
        }),
        transaction("same-day", {
          amount: "-100.00",
          bankDescription: "Ordinary credit",
          date: new Date("2026-09-10T00:00:00.000Z")
        }),
        transaction("one-day-transfer", {
          amount: "-100.00",
          bankDescription: "ACH PAYMENT RECEIVED",
          date: new Date("2026-09-11T00:00:00.000Z")
        })
      ]
    });

    expect(
      suggestions[0].candidates.map(
        (candidate) => candidate.incoming.transactionId
      )
    ).toEqual(["same-day", "one-day-transfer"]);
    expect(suggestions[0].candidates[1].reasons).toContain(
      "One bank description uses transfer-related wording."
    );
  });

  it("surfaces similarly plausible candidates as ambiguous", () => {
    const [suggestion] = buildTransferSuggestions({
      householdId,
      transactions: [
        transaction("out"),
        transaction("candidate-a", {
          amount: "-100.00",
          date: new Date("2026-09-10T00:00:00.000Z")
        }),
        transaction("candidate-b", {
          amount: "-100.00",
          date: new Date("2026-09-11T00:00:00.000Z")
        })
      ]
    });

    expect(suggestion).toMatchObject({
      ambiguous: true,
      ambiguityReason: expect.stringContaining("similarly plausible")
    });
  });

  it("orders deterministically and returns confirmation-required suggestions only", () => {
    const rows = [
      transaction("z-out", { amount: "25.00" }),
      transaction("z-in", { amount: "-25.00" }),
      transaction("a-out", { amount: "25.00" }),
      transaction("a-in", { amount: "-25.00" })
    ];
    const first = buildTransferSuggestions({
      householdId,
      transactions: rows
    });
    const second = buildTransferSuggestions({
      householdId,
      transactions: [...rows].reverse()
    });

    expect(first).toEqual(second);
    expect(first.map((suggestion) => suggestion.id)).toEqual([
      "suggestion:a-out",
      "suggestion:z-out"
    ]);
    expect(
      first.every((suggestion) =>
        suggestion.candidates.every(
          (candidate) => candidate.requiresConfirmation
        )
      )
    ).toBe(true);
  });
});
