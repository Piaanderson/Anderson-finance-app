export class ForbiddenError extends Error {
  constructor() {
    super("Resource does not belong to the active household.");
    this.name = "ForbiddenError";
  }
}

export function assertHouseholdOwnership(
  activeHouseholdId: string,
  resourceHouseholdId: string
) {
  if (activeHouseholdId !== resourceHouseholdId) {
    throw new ForbiddenError();
  }
}
