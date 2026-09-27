import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdDashboard } from "@/features/dashboard/dashboard-data";
import { DashboardExperience } from "@/features/dashboard/dashboard-experience";
import { currentUtcMonth, parseMonthKey } from "@/lib/month";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const owner = await requireHousehold();
  const { month: monthQuery } = await searchParams;
  const now = new Date();
  const selectedMonth =
    (typeof monthQuery === "string" ? parseMonthKey(monthQuery) : null) ??
    currentUtcMonth(now);
  const dashboard = await getHouseholdDashboard({
    householdId: owner.householdId,
    month: selectedMonth,
    now
  });

  return (
    <>
      <PageHeader
        title="Home"
        kicker={`${dashboard.selectedMonth.label} · ${dashboard.selectedMonth.pace.label}`}
      />
      <div className="page-content">
        <DashboardExperience dashboard={dashboard} />
      </div>
    </>
  );
}
