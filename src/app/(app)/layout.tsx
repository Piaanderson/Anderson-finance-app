import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireHousehold } from "@/server/households";
import { prisma } from "@/server/db";

export default async function AuthenticatedLayout({
  children
}: {
  children: ReactNode;
}) {
  const owner = await requireHousehold();
  const accounts = await prisma.financialAccount.findMany({
    where: { householdId: owner.householdId, isActive: true },
    select: { currentBalance: true }
  });
  const netWorth = accounts.reduce(
    (sum, account) => sum + (account.currentBalance?.toNumber() ?? 0),
    0
  );
  return <AppShell netWorth={netWorth}>{children}</AppShell>;
}
