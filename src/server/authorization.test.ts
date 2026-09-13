import { describe, expect, it } from "vitest";
import { assertHouseholdOwnership, ForbiddenError } from "./authorization";

describe("household ownership", () => {
  it("allows a resource owned by the active household", () => {
    expect(() => assertHouseholdOwnership("home-a", "home-a")).not.toThrow();
  });

  it("rejects a resource owned by another household", () => {
    expect(() => assertHouseholdOwnership("home-a", "home-b")).toThrow(
      ForbiddenError
    );
  });
});
