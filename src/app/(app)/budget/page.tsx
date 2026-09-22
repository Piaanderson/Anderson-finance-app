import type { Metadata } from "next";
import { AllocationBar } from "@/components/ui/allocation-bar";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdBudgetView } from "@/features/budget/budget-data";
import { parseBudgetMonthKey } from "@/features/budget/budget-domain";
import { BudgetMonthControls } from "@/features/budget/budget-month-controls";
import { BudgetSection } from "@/features/budget/budget-section";
import { signedUsd, usd } from "@/lib/money";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Budget" };

function defaultBudgetMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function BudgetPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const owner = await requireHousehold();
  const { month: monthQuery } = await searchParams;
  const now = new Date();
  const selectedMonth =
    (monthQuery ? parseBudgetMonthKey(monthQuery) : null) ??
    defaultBudgetMonth(now);
  const budget = await getHouseholdBudgetView({
    householdId: owner.householdId,
    month: selectedMonth
  });
  const plan = budget.plan;
  const calculation = plan?.calculation ?? null;
  const segmentTotals =
    calculation?.sections.map((section) => ({
      label: section.section,
      amount: Number(section.planned)
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Budget"
        actions={
          calculation ? (
            <div>
              <span className="eyebrow">Left to budget</span>
              <div
                className={
                  Number(calculation.leftToBudget) < 0
                    ? "card-value danger"
                    : "card-value positive"
                }
              >
                {signedUsd(Number(calculation.leftToBudget))}
              </div>
            </div>
          ) : null
        }
      />
      <div className="page-content">
        <BudgetMonthControls
          monthLabel={budget.monthLabel}
          monthKey={budget.monthKey}
          previousMonthKey={budget.previousMonthKey}
          nextMonthKey={budget.nextMonthKey}
          planExists={plan !== null}
          previousPlanExists={budget.previousPlanExists}
        />
        {calculation && plan ? (
          <>
            <section className="card" aria-labelledby="budget-summary-title">
              <div className="section-heading">
                <h2 id="budget-summary-title" tabIndex={-1}>
                  {budget.monthLabel} plan
                </h2>
                <span className="muted">
                  Income {usd.format(Number(calculation.incomePlan))}
                </span>
              </div>
              <p className="muted">
                Received from unmatched USD inflows:{" "}
                {usd.format(Number(calculation.observedIncome))}. The income
                plan is the household&apos;s manual monthly adjustment.
              </p>
              <AllocationBar
                income={Number(calculation.incomePlan)}
                segments={segmentTotals}
              />
              <dl className="budget-calculation-totals">
                {calculation.sections.map((section) => (
                  <div key={section.section}>
                    <dt>{section.section}</dt>
                    <dd>
                      {usd.format(Number(section.activity))}{" "}
                      {section.activityLabel} ·{" "}
                      {section.over !== "0.00"
                        ? `${usd.format(Number(section.over))} over`
                        : `${usd.format(Number(section.remaining))} ${section.remainingLabel}`}
                    </dd>
                  </div>
                ))}
              </dl>
              {calculation.unassignedSpending !== "0.00" ? (
                <p className="review-warning">
                  {usd.format(Number(calculation.unassignedSpending))} of
                  spending still needs a category and is not included in a
                  section.
                </p>
              ) : null}
              {calculation.unallocatedCategorizedSpending !== "0.00" ? (
                <p className="review-warning">
                  {signedUsd(
                    Number(calculation.unallocatedCategorizedSpending)
                  )}{" "}
                  belongs to categories without an allocation in this month.
                </p>
              ) : null}
              {plan.excludedAllocationCount > 0 ? (
                <p className="review-warning">
                  {plan.excludedAllocationCount} legacy allocation{" "}
                  {plan.excludedAllocationCount === 1 ? "is" : "are"} excluded
                  because its category section is invalid.
                </p>
              ) : null}
            </section>
            {calculation.sections.map((section) => (
              <BudgetSection
                key={section.section}
                calculation={section}
                destinations={plan.destinations}
              />
            ))}
          </>
        ) : (
          <section
            className="card empty-state"
            aria-labelledby="budget-summary-title"
          >
            <h2 id="budget-summary-title" tabIndex={-1}>
              No plan for {budget.monthLabel}
            </h2>
            <p className="muted">
              {budget.previousPlanExists
                ? "Copy the previous month to create a new draft with the same income, allocations, and active destinations."
                : "There is no previous monthly plan available to copy."}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
