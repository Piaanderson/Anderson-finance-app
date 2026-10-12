"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AllocationBar } from "@/components/ui/allocation-bar";
import { signedUsd, usd } from "@/lib/money";
import type {
  BudgetDestinationView,
  HouseholdBudgetDetailView,
  BudgetMovementEvidenceView,
  BudgetMovementLegView,
  BudgetMovementView
} from "./budget-data";
import type {
  BudgetCalculationAllocationRow,
  BudgetSectionCalculation
} from "./budget-domain";
import { BudgetMonthControls } from "./budget-month-controls";

type BudgetPlan = NonNullable<HouseholdBudgetDetailView["plan"]>;

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

function movementDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function movementLegAmount(leg: BudgetMovementLegView) {
  const formatted =
    leg.currencyKind === "ISO" && leg.currencyCode === "USD"
      ? amount(leg.amount)
      : `${leg.amount} ${leg.currencyCode ?? "currency unknown"}`;
  if (leg.direction === "OUTFLOW") return `−${formatted}`;
  if (leg.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

function MovementEvidence({ movement }: { movement: BudgetMovementView }) {
  return (
    <article
      className="budget-evidence-movement"
      aria-label={movement.description}
    >
      <div className="budget-evidence-heading">
        <strong>{movement.description}</strong>
        <span className="muted">
          {movementDate(movement.canonicalDate)}
          {movement.pending ? " · Pending" : ""}
        </span>
      </div>
      <ul className="budget-evidence-legs">
        {movement.legs.map((leg) => (
          <li key={leg.transactionId}>
            <span>
              {movementDate(leg.effectiveDate)} · {leg.accountName}
              {leg.accountMask ? ` · ${leg.accountMask}` : ""}
            </span>
            <span>{leg.description}</span>
            <strong>{movementLegAmount(leg)}</strong>
            <span className="muted">
              {leg.role === "OUTGOING"
                ? "Outgoing leg"
                : leg.role === "INCOMING"
                  ? "Incoming leg"
                  : "Source transaction"}
              {leg.pending ? " · Pending" : ""}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
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
  section
}: {
  destination: BudgetDestinationView | null;
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
  return (
    <div className="budget-destination-context">
      <span>
        {balance === null
          ? "Balance unavailable"
          : `${destination.classification === "DEBT" ? "Owed today" : "Balance today"} ${signedUsd(balance)}`}
      </span>
      <span className="muted">
        Expected date unavailable · no payment schedule is stored
      </span>
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

function MovementDetail({
  row,
  calculation,
  evidence
}: {
  row: BudgetCalculationAllocationRow;
  calculation: BudgetSectionCalculation;
  evidence: BudgetMovementEvidenceView;
}) {
  const transferEvidence = [
    ...evidence.activityMovements,
    ...evidence.relatedTransfers
  ].some((movement) => movement.kind === "TRANSFER");
  return (
    <details className="budget-movement-detail">
      <summary>
        {Number(row.activity) > 0
          ? `View ${calculation.activityLabel} movement detail`
          : "View movement availability"}
      </summary>
      <div
        className="budget-movement-panel"
        role="region"
        aria-label={`${row.categoryName} movement detail`}
      >
        <div>
          <span>Row activity this month</span>
          <strong>
            {amount(row.activity)} {calculation.activityLabel}
          </strong>
        </div>
        <p>{evidence.activityNote}</p>
        {evidence.activityMovements.length > 0 ? (
          <div className="budget-evidence-group">
            <h3>
              {evidence.activityAssociation === "DESTINATION"
                ? "Matched transfer legs"
                : "Activity transactions"}
            </h3>
            {evidence.activityMovements.map((movement) => (
              <MovementEvidence key={movement.id} movement={movement} />
            ))}
          </div>
        ) : null}
        {evidence.relatedTransferNote ? (
          <div className="budget-evidence-group">
            <h3>Related matched transfers</h3>
            <p>{evidence.relatedTransferNote}</p>
            {evidence.relatedTransfers.map((movement) => (
              <MovementEvidence key={movement.id} movement={movement} />
            ))}
          </div>
        ) : null}
        {transferEvidence ? (
          <p className="muted">
            Balance movement unavailable — the source contains both transfer
            legs, but no pre-movement balance snapshot.
          </p>
        ) : null}
        <Link href="/transactions">See source movement in Transactions</Link>
      </div>
    </details>
  );
}

function AllocationEditor({
  row,
  calculation,
  destination,
  destinationOptions,
  destinationUseCounts,
  movementEvidence,
  revision
}: {
  row: BudgetCalculationAllocationRow;
  calculation: BudgetSectionCalculation;
  destination: BudgetDestinationView | null;
  destinationOptions: BudgetDestinationView[];
  destinationUseCounts: Record<string, number>;
  movementEvidence: BudgetMovementEvidenceView;
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

  if (calculation.section === "Flex") {
    return (
      <li className="budget-flex-row">
        <form
          className="budget-flex-form"
          data-dirty={dirty ? "true" : "false"}
          onSubmit={submit}
          noValidate
        >
          <div className="budget-flex-category">
            <strong>{row.categoryName}</strong>
            {row.categoryArchived ? (
              <span className="warning">
                Archived category · this existing allocation is retained
              </span>
            ) : null}
          </div>
          <label className="budget-flex-budget" htmlFor={inputId}>
            <span>Budget</span>
            <span className="budget-inline-edit">
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
                aria-label="Planned USD"
                value={planned}
                aria-invalid={plannedError || error ? "true" : undefined}
                aria-describedby={plannedError || error ? errorId : undefined}
                onChange={(event) => setPlanned(event.target.value)}
              />
            </span>
          </label>
          <div className="budget-flex-progress">
            <span>Progress</span>
            <progress
              max={100}
              value={progress}
              aria-label={`${row.categoryName}: ${amount(row.activity)} spent. ${
                row.over !== "0.00"
                  ? `${amount(row.over)} over.`
                  : `${amount(row.remaining)} left.`
              }`}
            />
          </div>
          <div className="budget-flex-amount">
            <span>Spent</span>
            <strong>{amount(row.activity)}</strong>
          </div>
          <div className="budget-flex-amount">
            <span>Left · over</span>
            <strong className={row.over !== "0.00" ? "danger" : ""}>
              {row.over !== "0.00"
                ? `${amount(row.over)} over`
                : `${amount(row.remaining)} left`}
            </strong>
          </div>
          <div className="budget-flex-settings">
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
              section={calculation.section}
            />
            <button
              ref={saveButtonRef}
              className="button secondary budget-save"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving…" : `Save ${row.categoryName}`}
            </button>
          </div>
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
        </div>
        <MovementDetail
          row={row}
          calculation={calculation}
          evidence={movementEvidence}
        />
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
  const isFlex = calculation.section === "Flex";
  return (
    <section
      className={`budget-section budget-section-${calculation.section.toLowerCase()}`}
      aria-labelledby={headingId}
    >
      <h2 className="visually-hidden" id={headingId}>
        {calculation.section}
      </h2>
      <details open>
        <summary className="budget-section-heading">
          <span className="budget-disclosure-caret" aria-hidden="true">
            ▾
          </span>
          <span className="budget-section-title">
            <span className="eyebrow">
              {calculation.section === "Savings"
                ? "To savings"
                : calculation.section === "Debt"
                  ? "Debt budget"
                  : calculation.section === "Flex"
                    ? "Remaining for flex"
                    : "Needs"}
            </span>
            <span className="budget-section-name">{calculation.section}</span>
          </span>
          <span className="budget-section-summary">
            <strong>
              {isFlex ? flexAvailable : amount(calculation.planned)}
            </strong>
            <span className="muted">
              {amount(calculation.activity)} {calculation.activityLabel} ·{" "}
              {calculation.over !== "0.00"
                ? `${amount(calculation.over)} over`
                : `${amount(calculation.remaining)} ${calculation.remainingLabel}`}
            </span>
          </span>
        </summary>
        <div className="budget-section-body">
          {!isFlex && calculation.rows.length > 0 ? (
            <div className="budget-paired-labels" aria-hidden="true">
              <span>Budget this month</span>
              <span />
              <span>Destination · balance · expected</span>
            </div>
          ) : null}
          {isFlex && calculation.rows.length > 0 ? (
            <div className="budget-flex-labels" aria-hidden="true">
              <span>Category</span>
              <span>Budget</span>
              <span>Progress</span>
              <span>Spent</span>
              <span>Left · over</span>
            </div>
          ) : null}
          {calculation.rows.length > 0 ? (
            <ul className={isFlex ? "budget-flex-rows" : "budget-paired-rows"}>
              {calculation.rows.map((row) =>
                row.kind === "REVIEW" ? (
                  <li
                    className="budget-flex-row budget-review-row"
                    key={row.id}
                  >
                    <div className="budget-review-content">
                      <div className="budget-plan-cell">
                        <strong>{row.categoryName}</strong>
                        <span className="warning">
                          Uncategorized spending · temporary
                        </span>
                      </div>
                      <div className="budget-row-status">
                        <span>{amount(row.activity)} spent</span>
                        <strong>Counts against shared Flex</strong>
                      </div>
                      <Link
                        className="button secondary budget-save"
                        href="/transactions"
                      >
                        Review uncategorized transactions
                      </Link>
                    </div>
                  </li>
                ) : (
                  <AllocationEditor
                    key={row.id}
                    row={row}
                    calculation={calculation}
                    destination={plan.destinations[row.id]}
                    destinationOptions={plan.destinationOptions}
                    destinationUseCounts={plan.destinationUseCounts}
                    movementEvidence={plan.movementEvidence[row.id]}
                    revision={plan.allocationRevisions[row.id]}
                  />
                )
              )}
            </ul>
          ) : (
            <p className="muted budget-empty-section">
              No allocations in this section.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

export function BudgetExperience({
  budget,
  pace,
  todayMonthKey
}: {
  budget: HouseholdBudgetDetailView;
  pace: { day: number; daysInMonth: number; label: string };
  todayMonthKey: string;
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
  const headerContext = `${budget.monthLabel} · ${pace.label.toLowerCase()} · ${
    calculation
      ? `income ${amount(calculation.incomePlan)}`
      : "income plan unavailable"
  }`;

  return (
    <div className="budget-experience">
      <div className="budget-integrated-header">
        <BudgetMonthControls
          monthLabel={budget.monthLabel}
          monthKey={budget.monthKey}
          previousMonthKey={budget.previousMonthKey}
          nextMonthKey={budget.nextMonthKey}
          todayMonthKey={todayMonthKey}
          context={headerContext}
          planExists={plan !== null}
          previousPlanExists={budget.previousPlanExists}
        />
        {calculation ? (
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
        ) : null}
      </div>
      {calculation && plan ? (
        <>
          <section
            className="budget-summary"
            aria-labelledby="budget-summary-title"
          >
            <div className="budget-allocation-summary">
              <div className="budget-allocation-visual">
                <h2 id="budget-summary-title" tabIndex={-1}>
                  Where it goes
                </h2>
                <AllocationBar
                  income={Number(calculation.incomePlan)}
                  segments={segmentTotals}
                />
                <p className="muted">
                  Planned {amount(calculation.totalPlanned)} against{" "}
                  {amount(calculation.incomePlan)} income.
                </p>
              </div>
              <div className="budget-summary-stats">
                <span className="eyebrow">This month</span>
                <dl aria-label="Budget movement summary">
                  {calculation.sections.map((section) => (
                    <div key={section.section}>
                      <dt>{section.section}</dt>
                      <dd>
                        <span>
                          {amount(section.activity)} {section.activityLabel}
                        </span>
                        <strong aria-hidden="true"> / </strong>
                        <span>
                          {section.over !== "0.00"
                            ? `${amount(section.over)} over`
                            : `${amount(section.remaining)} ${section.remainingLabel}`}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <details className="budget-income-editor">
              <summary>Edit income plan</summary>
              <IncomeEditor
                budgetMonthId={plan.id}
                income={calculation.incomePlan}
                observedIncome={calculation.observedIncome}
                revision={plan.revision}
              />
            </details>
            {calculation.unassignedSpending !== "0.00" ? (
              <p className="review-warning">
                {amount(calculation.unassignedSpending)} is tracked in Flex
                under Needs review until those transactions are categorized.
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
          className="empty-state budget-empty-state"
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
  );
}
