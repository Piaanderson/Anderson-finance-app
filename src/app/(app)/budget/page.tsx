import type { Metadata } from "next";
import { AllocationBar } from "@/components/ui/allocation-bar";
import { PageHeader } from "@/components/shell/page-header";
import {
  BudgetSection,
  type BudgetRow
} from "@/features/budget/budget-section";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";
import { usd } from "@/lib/money";

export const metadata: Metadata = { title: "Budget" };

const demo: Record<string, BudgetRow[]> = {
  Debt: [
    {
      name: "Chase card",
      planned: 400,
      destination: "Chase · 4412",
      status: "$400 moved"
    },
    {
      name: "Capital One card",
      planned: 250,
      destination: "Capital One · 8830",
      status: "$250 moved"
    }
  ],
  Savings: [
    {
      name: "Vacation",
      planned: 300,
      destination: "CapOne · Vacation",
      status: "$300 moved"
    },
    {
      name: "HOA + birthdays",
      planned: 175,
      destination: "Savings",
      status: "Due Sep 20"
    }
  ],
  Needs: [
    {
      name: "Mortgage",
      planned: 2180,
      destination: "Rocket Mortgage",
      status: "Paid Sep 1"
    },
    {
      name: "Electric",
      planned: 145,
      destination: "Duke Energy",
      status: "$138 paid"
    }
  ],
  Flex: [
    {
      name: "Groceries",
      planned: 720,
      destination: "Any account",
      status: "$512 spent"
    },
    {
      name: "Dining",
      planned: 260,
      destination: "Any account",
      status: "$318 spent · over"
    }
  ]
};

export default async function BudgetPage() {
  const owner = await requireHousehold();
  const month = await prisma.budgetMonth.findUnique({
    where: {
      householdId_month: {
        householdId: owner.householdId,
        month: new Date("2026-09-01T00:00:00.000Z")
      }
    },
    include: { allocations: { include: { category: true } } }
  });
  const grouped = month
    ? Object.groupBy(
        month.allocations,
        (allocation) => allocation.category.section
      )
    : null;
  const sections = grouped
    ? Object.fromEntries(
        Object.entries(grouped).map(([section, allocations]) => [
          section,
          (allocations ?? []).map((allocation) => ({
            name: allocation.category.name,
            planned: allocation.planned.toNumber(),
            destination: "Planned destination",
            status: "Not moved"
          }))
        ])
      )
    : demo;
  const income = month?.income.toNumber() ?? 8240;
  const segmentTotals = Object.entries(sections).map(([label, rows]) => ({
    label,
    amount: rows.reduce((sum, row) => sum + row.planned, 0)
  }));
  const planned = segmentTotals.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <PageHeader
        title="Budget"
        actions={
          <div>
            <span className="eyebrow">Left to budget</span>
            <div className="card-value positive">
              {usd.format(income - planned)}
            </div>
          </div>
        }
      />
      <div className="page-content">
        <AllocationBar income={income} segments={segmentTotals} />
        {Object.entries(sections).map(([title, rows]) => (
          <BudgetSection key={title} title={title} rows={rows} />
        ))}
      </div>
    </>
  );
}
