import { describe, expect, it } from "vitest";
import {
  buildHouseholdMovements,
  summarizeCategorySpending,
  summarizeMovements,
  type MovementSourceTransaction
} from "./movements";

const householdId = "household-a";

function transaction(
  id: string,
  overrides: Partial<MovementSourceTransaction> = {}
): MovementSourceTransaction {
  return {
    id,
    householdId,
    accountId: `${id}-account`,
    account: {
      id: `${id}-account`,
      householdId,
      name: `${id} account`,
      mask: "1234",
      isActive: true
    },
    name: `${id} bank name`,
    merchantName: null,
    bankDescription: null,
    paymentMemo: null,
    referenceNumber: null,
    paymentChannel: null,
    transactionCode: null,
    checkNumber: null,
    amount: "10.00",
    isoCurrencyCode: "USD",
    unofficialCurrencyCode: null,
    date: new Date("2026-09-10T00:00:00.000Z"),
    authorizedDate: null,
    pending: false,
    removedAt: null,
    category: null,
    ...overrides
  };
}

describe("household movement construction", () => {
  it("represents a matched transfer once while retaining both source legs", () => {
    const outgoing = transaction("outgoing", {
      amount: "125.00",
      merchantName: "Card payment",
      bankDescription: "ONLINE PAYMENT REF 123"
    });
    const incoming = transaction("incoming", {
      amount: "-125.00",
      date: new Date("2026-09-11T00:00:00.000Z"),
      paymentMemo: "September payment"
    });

    const movements = buildHouseholdMovements({
      householdId,
      transactions: [incoming, outgoing],
      matches: [
        {
          id: "match",
          householdId,
          outgoingTransactionId: outgoing.id,
          incomingTransactionId: incoming.id
        }
      ]
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      id: "transfer:outgoing:incoming",
      kind: "TRANSFER",
      direction: "INTERNAL",
      description: "Card payment",
      amounts: [{ value: "125.00", currency: { kind: "ISO", code: "USD" } }]
    });
    expect(movements[0].legs.map((leg) => leg.transactionId)).toEqual([
      "outgoing",
      "incoming"
    ]);
    expect(movements[0].legs[0]).toMatchObject({
      bankDescription: "ONLINE PAYMENT REF 123",
      plaidAmount: "125.00"
    });
    expect(movements[0].legs[1]).toMatchObject({
      paymentMemo: "September payment",
      plaidAmount: "-125.00"
    });
  });

  it("keeps unmatched transactions independent with Plaid sign semantics", () => {
    const movements = buildHouseholdMovements({
      householdId,
      transactions: [
        transaction("purchase", { amount: "20.50" }),
        transaction("deposit", { amount: "-1000.00" }),
        transaction("zero", { amount: "0.00" })
      ],
      matches: []
    });

    expect(
      movements.map((movement) => [movement.id, movement.direction])
    ).toEqual([
      ["transaction:deposit", "INFLOW"],
      ["transaction:purchase", "OUTFLOW"],
      ["transaction:zero", "NEUTRAL"]
    ]);
  });

  it("uses the outgoing authorized date and outgoing description priority for transfers", () => {
    const movements = buildHouseholdMovements({
      householdId,
      transactions: [
        transaction("out", {
          amount: "40.00",
          merchantName: null,
          bankDescription: "Outgoing bank description",
          authorizedDate: new Date("2026-09-07T00:00:00.000Z"),
          date: new Date("2026-09-09T00:00:00.000Z")
        }),
        transaction("in", {
          amount: "-40.00",
          merchantName: "Incoming merchant",
          authorizedDate: new Date("2026-09-08T00:00:00.000Z"),
          date: new Date("2026-09-10T00:00:00.000Z")
        })
      ],
      matches: [
        {
          id: "match",
          householdId,
          outgoingTransactionId: "out",
          incomingTransactionId: "in"
        }
      ]
    });

    expect(movements[0]).toMatchObject({
      canonicalDate: "2026-09-07T00:00:00.000Z",
      description: "Outgoing bank description"
    });
  });

  it("orders deterministically by canonical date and then movement ID", () => {
    const result = () =>
      buildHouseholdMovements({
        householdId,
        transactions: [
          transaction("z", {
            date: new Date("2026-09-12T00:00:00.000Z")
          }),
          transaction("a", {
            date: new Date("2026-09-12T00:00:00.000Z")
          }),
          transaction("later", {
            date: new Date("2026-09-13T00:00:00.000Z")
          })
        ],
        matches: []
      }).map((movement) => movement.id);

    expect(result()).toEqual([
      "transaction:later",
      "transaction:a",
      "transaction:z"
    ]);
    expect(result()).toEqual(result());
  });

  it("keeps unlike currencies separate for transfers and cash-flow totals", () => {
    const movements = buildHouseholdMovements({
      householdId,
      transactions: [
        transaction("transfer-out", { amount: "100.00" }),
        transaction("transfer-in", {
          amount: "-90.00",
          isoCurrencyCode: "EUR"
        }),
        transaction("usd-spend", { amount: "25.25" }),
        transaction("eur-income", {
          amount: "-30.50",
          isoCurrencyCode: "EUR"
        })
      ],
      matches: [
        {
          id: "match",
          householdId,
          outgoingTransactionId: "transfer-out",
          incomingTransactionId: "transfer-in"
        }
      ]
    });
    const transfer = movements.find((movement) => movement.kind === "TRANSFER");

    expect(transfer?.amounts).toEqual([
      { value: "100.00", currency: { kind: "ISO", code: "USD" } },
      { value: "90.00", currency: { kind: "ISO", code: "EUR" } }
    ]);
    expect(summarizeMovements(movements)).toEqual([
      {
        currency: { kind: "ISO", code: "EUR" },
        income: "30.50",
        spending: "0.00"
      },
      {
        currency: { kind: "ISO", code: "USD" },
        income: "0.00",
        spending: "25.25"
      }
    ]);
  });

  it("excludes transfers from Home cash flow and Budget category spending", () => {
    const category = {
      id: "groceries",
      householdId,
      name: "Groceries",
      section: "Flex",
      archivedAt: null
    };
    const movements = buildHouseholdMovements({
      householdId,
      transactions: [
        transaction("out", {
          amount: "400.00",
          category
        }),
        transaction("in", {
          amount: "-400.00",
          category
        }),
        transaction("groceries", { amount: "12.34", category }),
        transaction("paycheck", { amount: "-1000.00" })
      ],
      matches: [
        {
          id: "match",
          householdId,
          outgoingTransactionId: "out",
          incomingTransactionId: "in"
        }
      ]
    });

    expect(summarizeMovements(movements)).toEqual([
      {
        currency: { kind: "ISO", code: "USD" },
        income: "1000.00",
        spending: "12.34"
      }
    ]);
    expect(summarizeCategorySpending(movements)).toEqual([
      {
        categoryId: "groceries",
        currency: { kind: "ISO", code: "USD" },
        spending: "12.34"
      }
    ]);
  });

  it("excludes removed and foreign-account rows without erasing inactive account history", () => {
    const movements = buildHouseholdMovements({
      householdId,
      transactions: [
        transaction("removed", { removedAt: new Date() }),
        transaction("foreign", {
          account: {
            id: "foreign-account",
            householdId: "household-b",
            name: "Foreign account",
            mask: null,
            isActive: true
          },
          accountId: "foreign-account"
        }),
        transaction("historical", {
          account: {
            id: "historical-account",
            householdId,
            name: "Disconnected checking",
            mask: null,
            isActive: false
          },
          accountId: "historical-account",
          pending: true
        })
      ],
      matches: []
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      id: "transaction:historical",
      pending: true,
      legs: [{ account: { active: false } }]
    });
  });
});
