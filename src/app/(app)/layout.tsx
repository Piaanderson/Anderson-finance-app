import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { getHouseholdPositionSummary } from "@/features/accounts/position-summary";
import { requireHousehold } from "@/server/households";

export default async function AuthenticatedLayout({
  children
}: {
  children: ReactNode;
}) {
  const owner = await requireHousehold();
  const positionSummary = await getHouseholdPositionSummary(owner.householdId);
  return <AppShell positionSummary={positionSummary}>{children}</AppShell>;
}
