"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AllocationBar } from "@/components/ui/allocation-bar";
import { signedUsd, usd } from "@/lib/money";
import type { BudgetDestinationView, HouseholdBudgetView } from "./budget-data";
import type {
  BudgetCalculationRow,
  BudgetSectionCalculation
} from "./budget-domain";
import { BudgetMonthControls } from "./budget-month-controls";

type BudgetPlan = NonNullable<HouseholdBudgetView["plan"]>;

type EditResponse = {
  error?: string;
  fieldErrors?: {
    income?: string;
    planned?: string;
    destinationAccountId?: string;
  };
  income?: string;
  planned?: string;
  revision?: string;
  warning?: string | null;
};

function amount(value: string) {
  return usd.format(Number(value));
}

function destinationLabel(destination: BudgetDestinationView) {
  return `${destination.name}${destination.mask ? ` · ${destination.mask}` : ""}`;
}

function IncomeEditor({
  budgetMonthId,
  income,
  observedIncome,
  revision
}: {
  budgetMonthId: string;
  income: string;
  observedIncome: string;
  revision: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(income);
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");
    setError("");
    setFieldError("");
    const response = await fetch(`/api/budget/months/${budgetMonthId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        income: value,
        expectedUpdatedAt: currentRevision
      })
    }).catch(() => null);
    const payload = response
      ? ((await response.json().catch(() => null)) as EditResponse | null)
      : null;
    if (!response?.ok || !payload?.revision || !payload.income) {
      setError(
        payload?.error ??
          "The income plan could not be saved. Check your connection and try again."
      );
      setFieldError(payload?.fieldErrors?.income ?? "");
      setPending(false);
      inputRef.current?.focus();
      return;
    }
    setValue(payload.income);
    setCurrentRevision(payload.revision);
    setStatus(`Income plan saved at ${amount(payload.income)}.`);
    setPending(false);
    router.refresh();
  }

  const errorId = "budget-income-error";
  const hintId = "budget-income-hint";
  return (
    <form className="budget-income-form" onSubmit={submit} noValidate>
      <label htmlFor="budget-income">Income plan</label>
      <div className="budget-inline-edit">
        <span aria-hidden="true">$</span>
        <input
          ref={inputRef}
          className="input budget-money-input"
          id="budget-income"
          name="income"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required
          value={value}
          aria-invalid={fieldError || error ? "true" : undefined}
          aria-describedby={`${hintId}${fieldError || error ? ` ${errorId}` : ""}`}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save income"}
        </button>
      </div>
      <p className="muted budget-edit-hint" id={hintId}>
        Manual USD plan · observed income {amount(observedIncome)}
      </p>
      {error ? (
        <p className="review-error" id={errorId} role="alert">
          {fieldError || error}
        </p>
      ) : null}
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

function DestinationContext({
  destination,
  remaining,
  section
}: {
  destination: BudgetDestinationView | null;
  remaining: string;
  section: BudgetSectionCalculation["section"];
}) {
  if (!destination) {
    return <p className="muted">Choose the real account this plan uses.</p>;
  }
  if (!destination.active) {
    return (
      <p className="warning">
        This destination is unavailable for a USD plan. Choose another account.
      </p>
    );
  }
  const balance =
    destination.currentBalance === null
      ? null
      : Number(destination.currentBalance);
  const showProjection =
    balance !== null &&
    (section === "Debt" || section === "Savings" || section === "Needs");
  return (
    <div className="budget-destination-context">
      <span>
        {balance === null
          ? "Balance unavailable"
          : `${destination.classification === "DEBT" ? "Owed" : "Balance today"} ${signedUsd(balance)}`}
      </span>
      {showProjection && Number(remaining) > 0 ? (
        <span className="muted">
          After remaining plan {signedUsd(balance + Number(remaining))}
        </span>
      ) : null}
      {section === "Needs" &&
      destination.classification === "DEBT" &&
      destination.relatedProperties.length > 0 ? (
        <span className="mortgage-context">
          <span>
            Mortgage owed{" "}
            {balance === null ? "unavailable" : signedUsd(balance)}
          </span>
          {destination.relatedProperties.map((property) => (
            <span key={property.id}>
              {property.name} value{" "}
              {property.currentBalance === null
                ? "unavailable"
                : signedUsd(Number(property.currentBalance))}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function AllocationEditor({
  row,
  calculation,
  destination,
  destinationOptions,
  destinationUseCounts,
  revision
}: {
  row: BudgetCalculationRow;
  calculation: BudgetSectionCalculation;
  destination: BudgetDestinationView | null;
  destinationOptions: BudgetDestinationView[];
  destinationUseCounts: Record<string, number>;
  revision: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [planned, setPlanned] = useState(row.planned);
  const [destinationId, setDestinationId] = useState(
    row.destinationAccountId ?? ""
  );
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [plannedError, setPlannedError] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [serverWarning, setServerWarning] = useState("");

  useEffect(() => {
    if (status) saveButtonRef.current?.focus();
  }, [status]);

  const selectedDestination =
    destinationOptions.find((option) => option.id === destinationId) ??
    (destination?.id === destinationId ? destination : null);
  const destinationOtherUses = destinationId
    ? Math.max(
        (destinationUseCounts[destinationId] ?? 0) -
          (row.destinationAccountId === destinationId ? 1 : 0),
        0
      )
    : 0;
  const reuseWarning =
    destinationOtherUses > 0
      ? "This destination is already used by another allocation. Matched transfers are shared once in budget order."
      : serverWarning;
  const dirty =
    planned !== row.planned ||
    destinationId !== (row.destinationAccountId ?? "");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus("");
    setError("");
    setPlannedError("");
    setDestinationError("");
    setServerWarning("");
    const response = await fetch(`/api/budget/allocations/${row.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planned,
        destinationAccountId: destinationId || null,
        expectedUpdatedAt: currentRevision
      })
    }).catch(() => null);
    const payload = response
      ? ((await response.json().catch(() => null)) as EditResponse | null)
      : null;
    if (!response?.ok || !payload?.revision || !payload.planned) {
      setError(
        payload?.error ??
          "This allocation could not be saved. Check your connection and try again."
      );
      setPlannedError(payload?.fieldErrors?.planned ?? "");
      setDestinationError(payload?.fieldErrors?.destinationAccountId ?? "");
      setPending(false);
      inputRef.current?.focus();
      return;
    }
    setPlanned(payload.planned);
    setCurrentRevision(payload.revision);
    setServerWarning(payload.warning ?? "");
    setStatus(`${row.categoryName} allocation saved.`);
    setPending(false);
    router.refresh();
  }

  const inputId = `budget-planned-${row.id}`;
  const destinationIdValue = `budget-destination-${row.id}`;
  const errorId = `budget-error-${row.id}`;
  const warningId = `budget-warning-${row.id}`;
  const progress =
    Number(row.planned) > 0
      ? Math.min(
          (Math.max(Number(row.activity), 0) / Number(row.planned)) * 100,
          100
        )
      : Number(row.activity) > 0
        ? 100
        : 0;
  return (
    <li className="budget-paired-row">
      <form
        className="budget-paired-form"
        data-dirty={dirty ? "true" : "false"}
        onSubmit={submit}
        noValidate
      >
        <div className="budget-plan-cell">
          <strong>{row.categoryName}</strong>
          {row.categoryArchived ? (
            <span className="warning">
              Archived category · this existing allocation is retained
            </span>
          ) : null}
          <label htmlFor={inputId}>Planned USD</label>
          <div className="budget-inline-edit">
            <span aria-hidden="true">$</span>
            <input
              ref={inputRef}
              className="input budget-money-input"
              id={inputId}
              name="planned"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              value={planned}
              aria-invalid={plannedError || error ? "true" : undefined}
              aria-describedby={plannedError || error ? errorId : undefined}
              onChange={(event) => setPlanned(event.target.value)}
            />
          </div>
        </div>
        <div className="budget-wire" aria-hidden="true">
          <span />
          <b>→</b>
        </div>
        <div className="budget-destination-cell">
          <label htmlFor={destinationIdValue}>Destination account</label>
          <select
            className="input"
            id={destinationIdValue}
            name="destinationAccountId"
            value={destinationId}
            aria-invalid={destinationError ? "true" : undefined}
            aria-describedby={
              `${reuseWarning ? warningId : ""}${destinationError ? ` ${errorId}` : ""}`.trim() ||
              undefined
            }
            onChange={(event) => {
              setDestinationId(event.target.value);
              setServerWarning("");
            }}
          >
            <option value="">No destination selected</option>
            {destination && !destination.active ? (
              <option value={destination.id} disabled>
                {destinationLabel(destination)} · unavailable
              </option>
            ) : null}
            {destinationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {destinationLabel(option)}
              </option>
            ))}
          </select>
          <DestinationContext
            destination={selectedDestination}
            remaining={row.remaining}
            section={calculation.section}
          />
        </div>
        <div className="budget-row-progress">
          <div className="budget-row-status">
            <span>
              {amount(row.activity)} {calculation.activityLabel}
            </span>
            <strong className={row.over !== "0.00" ? "danger" : ""}>
              {row.over !== "0.00"
                ? `${amount(row.over)} over`
                : `${amount(row.remaining)} ${calculation.remainingLabel}`}
            </strong>
          </div>
          {calculation.section === "Flex" ? (
            <div
              className="flex-progress"
              role="img"
              aria-label={`${row.categoryName}: ${amount(row.activity)} spent. ${
                row.over !== "0.00"
                  ? `${amount(row.over)} over.`
                  : `${amount(row.remaining)} left.`
              }`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>
        <button
          ref={saveButtonRef}
          className="button secondary budget-save"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : `Save ${row.categoryName}`}
        </button>
        {reuseWarning ? (
          <p className="budget-reuse-warning" id={warningId}>
            Warning: {reuseWarning}
          </p>
        ) : null}
        {error ? (
          <p
            className="review-error budget-edit-error"
            id={errorId}
            role="alert"
          >
            {plannedError || destinationError || error}
          </p>
        ) : null}
        <p className="visually-hidden" role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </li>
  );
}

function BudgetSection({
  calculation,
  plan
}: {
  calculation: BudgetSectionCalculation;
  plan: BudgetPlan;
}) {
  const headingId = `budget-${calculation.section.toLowerCase()}`;
  const flexAvailable =
    calculation.over !== "0.00"
      ? `${amount(calculation.over)} over`
      : `${amount(calculation.remaining)} left`;
  return (
    <section
      className={`card budget-section budget-section-${calculation.section.toLowerCase()}`}
      aria-labelledby={headingId}
    >
      <div className="budget-section-heading">
        <div>
          <span className="eyebrow">
            {calculation.section === "Savings"
              ? "To savings"
              : calculation.section === "Debt"
                ? "Debt budget"
                : calculation.section === "Flex"
                  ? "Remaining for flex"
                  : "Needs"}
          </span>
          <h2 id={headingId}>{calculation.section}</h2>
        </div>
        <div className="budget-section-summary">
          <strong>
            {calculation.section === "Flex"
              ? flexAvailable
              : amount(calculation.planned)}
          </strong>
          <span className="muted">
            {amount(calculation.activity)} {calculation.activityLabel} ·{" "}
            {calculation.over !== "0.00"
              ? `${amount(calculation.over)} over`
              : `${amount(calculation.remaining)} ${calculation.remainingLabel}`}
          </span>
        </div>
      </div>
      {calculation.rows.length > 0 ? (
        <ul className="budget-paired-rows">
          {calculation.rows.map((row) => (
            <AllocationEditor
              key={row.id}
              row={row}
              calculation={calculation}
              destination={plan.destinations[row.id]}
              destinationOptions={plan.destinationOptions}
              destinationUseCounts={plan.destinationUseCounts}
              revision={plan.allocationRevisions[row.id]}
            />
          ))}
        </ul>
      ) : (
        <p className="muted">No allocations in this section.</p>
      )}
    </section>
  );
}

export function BudgetExperience({
  budget,
  pace
}: {
  budget: HouseholdBudgetView;
  pace: { day: number; daysInMonth: number; label: string };
}) {
  const plan = budget.plan;
  const calculation = plan?.calculation;
  const segmentTotals = useMemo(
    () =>
      calculation?.sections.map((section) => ({
        label: section.section,
        amount: Number(section.planned)
      })) ?? [],
    [calculation]
  );

  return (
    <>
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
          <section
            className="card budget-summary"
            aria-labelledby="budget-summary-title"
          >
            <div className="budget-summary-heading">
              <div>
                <span className="eyebrow">Budget · {budget.monthLabel}</span>
                <h2 id="budget-summary-title" tabIndex={-1}>
                  {budget.monthLabel}
                </h2>
                <p className="muted">
                  {pace.label} · observed income{" "}
                  {amount(calculation.observedIncome)}
                </p>
              </div>
              <div className="budget-left">
                <span className="eyebrow">Left to budget</span>
                <strong
                  className={
                    Number(calculation.leftToBudget) < 0 ? "danger" : "positive"
                  }
                >
                  {signedUsd(Number(calculation.leftToBudget))}
                </strong>
              </div>
            </div>
            <div className="budget-summary-edit">
              <IncomeEditor
                budgetMonthId={plan.id}
                income={calculation.incomePlan}
                observedIncome={calculation.observedIncome}
                revision={plan.revision}
              />
              <div className="budget-pace">
                <div>
                  <span className="eyebrow">Month pace</span>
                  <strong>
                    Day {pace.day} of {pace.daysInMonth}
                  </strong>
                </div>
                <meter
                  min={0}
                  max={pace.daysInMonth}
                  value={pace.day}
                  aria-label={`Month pace: day ${pace.day} of ${pace.daysInMonth}`}
                />
              </div>
            </div>
            <div className="budget-allocation-summary">
              <div>
                <AllocationBar
                  income={Number(calculation.incomePlan)}
                  segments={segmentTotals}
                />
                <p className="muted">
                  Planned {amount(calculation.totalPlanned)} against{" "}
                  {amount(calculation.incomePlan)} income.
                </p>
              </div>
              <div className="where-it-goes">
                <h3>Where it goes</h3>
                <dl>
                  {calculation.sections.map((section) => (
                    <div key={section.section}>
                      <dt>{section.section}</dt>
                      <dd>
                        {amount(section.activity)} {section.activityLabel} ·{" "}
                        {section.over !== "0.00"
                          ? `${amount(section.over)} over`
                          : `${amount(section.remaining)} ${section.remainingLabel}`}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            {calculation.unassignedSpending !== "0.00" ? (
              <p className="review-warning">
                {amount(calculation.unassignedSpending)} of spending still needs
                a category and is not included in a section.
              </p>
            ) : null}
            {calculation.unallocatedCategorizedSpending !== "0.00" ? (
              <p className="review-warning">
                {signedUsd(Number(calculation.unallocatedCategorizedSpending))}{" "}
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
              plan={plan}
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
    </>
  );
}
