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
    select: { type: true, currentBalance: true }
  });
  const netWorth = accounts.reduce((sum, account) => {
    const balance = account.currentBalance?.toNumber() ?? 0;
    return (
      sum + (["credit", "loan"].includes(account.type) ? -balance : balance)
    );
  }, 0);
  return <AppShell netWorth={netWorth}>{children}</AppShell>;
}
