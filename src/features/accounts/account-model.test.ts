import { describe, expect, it } from "vitest";
import {
  classificationForPlaidType,
  classificationLabel,
  positionBalanceFromPlaid
} from "./account-model";

describe("financial account model", () => {
  it.each([
    ["depository", "CASH"],
    ["investment", "INVESTED"],
    ["credit", "DEBT"],
    ["loan", "DEBT"],
    ["other", "UNCLASSIFIED"]
  ] as const)("classifies Plaid %s accounts as %s", (type, expected) => {
    expect(classificationForPlaidType(type)).toBe(expected);
  });

  it("keeps signed asset positions exactly as Plaid reports them", () => {
    expect(positionBalanceFromPlaid("CASH", 125)).toBe(125);
    expect(positionBalanceFromPlaid("CASH", -40)).toBe(-40);
    expect(positionBalanceFromPlaid("INVESTED", 500)).toBe(500);
  });

  it("inverts Plaid amount-owed balances into signed debt positions", () => {
    expect(positionBalanceFromPlaid("DEBT", 125)).toBe(-125);
    expect(positionBalanceFromPlaid("DEBT", -25)).toBe(25);
    expect(positionBalanceFromPlaid("DEBT", null)).toBeNull();
  });

  it("labels every explicit classification without exposing provider types", () => {
    expect(
      (["CASH", "INVESTED", "PROPERTY", "DEBT", "UNCLASSIFIED"] as const).map(
        classificationLabel
      )
    ).toEqual(["Cash", "Invested", "Property", "Debt", "Needs classification"]);
  });
});
