"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CategoryReviewChoice,
  MerchantRuleReview
} from "@/features/categories/category-data";
import { merchantRuleKey } from "@/features/categories/merchant-rule";
import type {
  HouseholdMovement,
  MovementLeg,
  TransactionMovement,
  TransferMovement
} from "./movements";
import { CategoryReview } from "./category-review";
import { TransactionDetailDrawer } from "./transaction-detail-drawer";
import { TransactionRow } from "./transaction-row";
import { TransferReview } from "./transfer-review";
import type {
  TransferSuggestion,
  TransferSuggestionCandidate
} from "./transfer-suggestions";

const ANNOUNCEMENT_STORAGE_KEY = "currents:transactions:announcement";
const FOCUS_STORAGE_KEY = "currents:transactions:focus";

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function shiftMonth(month: string, amount: number) {
  const [year, index] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, index - 1 + amount, 1));
  return value.toISOString().slice(0, 7);
}

function transactionHref(month: string, query: string) {
  return {
    pathname: "/transactions" as const,
    query: query.trim() ? { month, query: query.trim() } : { month }
  };
}

export type CategoryAssignmentOptions = {
  ruleAction: MerchantRuleAction;
  merchantKey: string;
  expectedRuleRevision: string | null;
};

export type MerchantRuleAction = "PRESERVE" | "UPSERT" | "DELETE";

function focusElement(target: string) {
  if (target === "review") {
    return (
      document.querySelector<HTMLElement>("[data-transfer-primary-action]") ??
      document.querySelector<HTMLElement>(".category-combobox input") ??
      document.querySelector<HTMLElement>("[data-resume-deferred]") ??
      document.querySelector<HTMLElement>(".category-review-action") ??
      document.getElementById("ledger-title")
    );
  }
  if (target === "category-review") {
    return (
      document.querySelector<HTMLElement>(".category-combobox input") ??
      document.querySelector<HTMLElement>("[data-category-primary-action]") ??
      document.querySelector<HTMLElement>("[data-transfer-primary-action]") ??
      document.getElementById("ledger-title")
    );
  }
  if (target === "ledger") return document.getElementById("ledger-title");
  return document.getElementById(target);
}

function sortMovements(movements: HouseholdMovement[]) {
  return [...movements].sort((left, right) => {
    const dateOrder = right.canonicalDate.localeCompare(left.canonicalDate);
    return dateOrder || left.id.localeCompare(right.id);
  });
}

function sourceMovement(movements: HouseholdMovement[], transactionId: string) {
  return movements.find(
    (movement): movement is TransactionMovement =>
      movement.kind === "TRANSACTION" &&
      movement.legs[0].transactionId === transactionId
  );
}

function optimisticTransfer(
  matchId: string,
  candidate: TransferSuggestionCandidate,
  movements: HouseholdMovement[]
): TransferMovement | null {
  const outgoing = sourceMovement(movements, candidate.outgoing.transactionId);
  const incoming = sourceMovement(movements, candidate.incoming.transactionId);
  if (!outgoing || !incoming) return null;
  const outgoingLeg: MovementLeg = {
    ...outgoing.legs[0],
    role: "OUTGOING"
  };
  const incomingLeg: MovementLeg = {
    ...incoming.legs[0],
    role: "INCOMING"
  };
  return {
    id: `transfer:${outgoingLeg.transactionId}:${incomingLeg.transactionId}`,
    kind: "TRANSFER",
    direction: "INTERNAL",
    category: null,
    matchId,
    canonicalDate: outgoingLeg.effectiveDate,
    description: outgoing.description,
    pending: false,
    amounts: [outgoingLeg.amount],
    legs: [outgoingLeg, incomingLeg]
  };
}

function optimisticTransaction(leg: MovementLeg): TransactionMovement {
  const singleLeg: MovementLeg = { ...leg, role: "SINGLE" };
  return {
    id: `transaction:${leg.transactionId}`,
    kind: "TRANSACTION",
    direction: leg.direction,
    category: leg.category,
    canonicalDate: leg.effectiveDate,
    description:
      leg.merchantName?.trim() ||
      leg.bankDescription?.trim() ||
      leg.name.trim() ||
      "Transaction",
    pending: leg.pending,
    amounts: [leg.amount],
    legs: [singleLeg]
  };
}

async function responseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? "The update could not be completed.";
}

export function TransactionsWorkspace({
  movements,
  suggestions,
  categories,
  rules,
  month,
  query
}: {
  movements: HouseholdMovement[];
  suggestions: TransferSuggestion[];
  categories: CategoryReviewChoice[];
  rules: MerchantRuleReview[];
  month: string;
  query: string;
}) {
  const router = useRouter();
  const [movementOverride, setMovementOverride] = useState<
    HouseholdMovement[] | null
  >(null);
  const [previousMovements, setPreviousMovements] = useState(movements);
  const [skippedSuggestionIds, setSkippedSuggestionIds] = useState<Set<string>>(
    new Set()
  );
  const [skippedCategoryTransactionIds, setSkippedCategoryTransactionIds] =
    useState<Set<string>>(new Set());
  const [locallyMatchedTransactionIds, setLocallyMatchedTransactionIds] =
    useState<Set<string>>(new Set());
  const [rulesOverride, setRulesOverride] = useState<
    MerchantRuleReview[] | null
  >(null);
  const [previousRules, setPreviousRules] = useState(rules);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [reviewFilter, setReviewFilter] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [selectedMovementIds, setSelectedMovementIds] = useState<Set<string>>(
    new Set()
  );
  const [detailMovementId, setDetailMovementId] = useState<string | null>(null);
  const [detailReturnFocus, setDetailReturnFocus] =
    useState<HTMLElement | null>(null);
  const [focusTarget, setFocusTarget] = useState<
    "review" | "ledger" | string | null
  >(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  if (movements !== previousMovements) {
    setPreviousMovements(movements);
    setMovementOverride(null);
  }
  if (rules !== previousRules) {
    setPreviousRules(rules);
    setRulesOverride(null);
  }
  const displayMovements = movementOverride ?? movements;
  const displayRules = rulesOverride ?? rules;
  const detailMovement =
    displayMovements.find((movement) => movement.id === detailMovementId) ??
    null;
  const accounts = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; mask: string | null; active: boolean }
    >();
    for (const movement of displayMovements) {
      for (const leg of movement.legs) byId.set(leg.account.id, leg.account);
    }
    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [displayMovements]);
  useEffect(() => {
    const retainedAnnouncement = sessionStorage.getItem(
      ANNOUNCEMENT_STORAGE_KEY
    );
    if (retainedAnnouncement && liveRegionRef.current) {
      liveRegionRef.current.textContent = retainedAnnouncement;
      sessionStorage.removeItem(ANNOUNCEMENT_STORAGE_KEY);
    }
    const retainedFocus = sessionStorage.getItem(FOCUS_STORAGE_KEY);
    if (!retainedFocus) return;
    const frame = requestAnimationFrame(() => {
      focusElement(retainedFocus)?.focus();
      sessionStorage.removeItem(FOCUS_STORAGE_KEY);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const unresolvedSuggestions = useMemo(
    () =>
      suggestions
        .filter(
          (suggestion) =>
            !locallyMatchedTransactionIds.has(suggestion.outgoingTransactionId)
        )
        .map((suggestion) => ({
          ...suggestion,
          candidates: suggestion.candidates.filter(
            (candidate) =>
              !locallyMatchedTransactionIds.has(
                candidate.outgoing.transactionId
              ) &&
              !locallyMatchedTransactionIds.has(
                candidate.incoming.transactionId
              )
          )
        }))
        .filter((suggestion) => suggestion.candidates.length > 0),
    [locallyMatchedTransactionIds, suggestions]
  );
  const visibleSuggestions = useMemo(
    () =>
      unresolvedSuggestions.filter(
        (suggestion) => !skippedSuggestionIds.has(suggestion.id)
      ),
    [skippedSuggestionIds, unresolvedSuggestions]
  );
  const unresolvedCategoryQueue = useMemo(
    () =>
      displayMovements.filter(
        (movement): movement is TransactionMovement =>
          movement.kind === "TRANSACTION" && movement.category === null
      ),
    [displayMovements]
  );
  const categoryQueue = useMemo(
    () =>
      unresolvedCategoryQueue.filter(
        (movement) =>
          !skippedCategoryTransactionIds.has(movement.legs[0].transactionId)
      ),
    [skippedCategoryTransactionIds, unresolvedCategoryQueue]
  );
  const filteredMovements = useMemo(() => {
    const accountMovements =
      accountFilter === "all"
        ? displayMovements
        : displayMovements.filter((movement) =>
            movement.legs.some((leg) => leg.account.id === accountFilter)
          );
    if (!reviewFilter) return accountMovements;
    const reviewTransactionIds = new Set([
      ...unresolvedCategoryQueue.map(
        (movement) => movement.legs[0].transactionId
      ),
      ...unresolvedSuggestions.flatMap((suggestion) => [
        suggestion.outgoingTransactionId,
        ...suggestion.candidates.flatMap((candidate) => [
          candidate.outgoing.transactionId,
          candidate.incoming.transactionId
        ])
      ])
    ]);
    return accountMovements.filter((movement) =>
      movement.legs.some((leg) => reviewTransactionIds.has(leg.transactionId))
    );
  }, [
    accountFilter,
    displayMovements,
    reviewFilter,
    unresolvedCategoryQueue,
    unresolvedSuggestions
  ]);

  useEffect(() => {
    if (!focusTarget) return;
    const frame = requestAnimationFrame(() => {
      focusElement(focusTarget)?.focus();
      setFocusTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [displayMovements, focusTarget, visibleSuggestions.length]);

  function announce(message: string, retainAfterRefresh = false) {
    if (retainAfterRefresh) {
      sessionStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, message);
      window.setTimeout(() => {
        if (sessionStorage.getItem(ANNOUNCEMENT_STORAGE_KEY) === message) {
          sessionStorage.removeItem(ANNOUNCEMENT_STORAGE_KEY);
        }
      }, 5000);
    }
    setAnnouncement(message);
  }

  function moveFocus(
    target: "review" | "ledger" | string,
    retainAfterRefresh = false
  ) {
    if (retainAfterRefresh) {
      sessionStorage.setItem(FOCUS_STORAGE_KEY, target);
      window.setTimeout(() => {
        if (sessionStorage.getItem(FOCUS_STORAGE_KEY) === target) {
          sessionStorage.removeItem(FOCUS_STORAGE_KEY);
        }
      }, 5000);
    }
    setFocusTarget(target);
  }

  async function tie(candidate: TransferSuggestionCandidate) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outgoingTransactionId: candidate.outgoing.transactionId,
        incomingTransactionId: candidate.incoming.transactionId
      })
    }).catch(() => null);
    if (!response?.ok) {
      setError(
        response
          ? await responseError(response)
          : "The transfer could not be tied. Check your connection and try again."
      );
      setBusy(false);
      return;
    }
    const { id } = (await response.json()) as { id: string };
    const transfer = optimisticTransfer(id, candidate, displayMovements);
    if (transfer) {
      setMovementOverride(
        sortMovements([
          ...displayMovements.filter(
            (movement) =>
              !movement.legs.some((leg) =>
                [
                  candidate.outgoing.transactionId,
                  candidate.incoming.transactionId
                ].includes(leg.transactionId)
              )
          ),
          transfer
        ])
      );
    }
    setLocallyMatchedTransactionIds(
      (current) =>
        new Set([
          ...current,
          candidate.outgoing.transactionId,
          candidate.incoming.transactionId
        ])
    );
    announce("The two source transactions were tied as one transfer.", true);
    setBusy(false);
    moveFocus("review", true);
    window.setTimeout(() => router.refresh(), 1000);
  }

  function skipSuggestion() {
    const current = visibleSuggestions[0];
    if (!current) return;
    setSkippedSuggestionIds((skipped) => new Set([...skipped, current.id]));
    announce("Transfer suggestion skipped for now.");
    moveFocus("review");
  }

  async function assignCategory(
    movement: TransactionMovement,
    category: CategoryReviewChoice,
    ruleAction: MerchantRuleAction,
    merchantKey: string,
    expectedRuleRevision: string | null,
    focusAfter: "category-review" | "ledger" | null = "category-review"
  ) {
    setBusy(true);
    setError("");
    const transactionId = movement.legs[0].transactionId;
    const response = await fetch(
      `/api/transactions/${transactionId}/category`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          categoryId: category.id,
          ruleAction,
          merchantKey,
          expectedTransactionRevision: movement.legs[0].revision,
          expectedRuleRevision
        })
      }
    ).catch(() => null);
    if (!response?.ok) {
      setError(
        response
          ? await responseError(response)
          : "The category could not be assigned. Check your connection and try again."
      );
      setBusy(false);
      return false;
    }
    const payload = (await response.json()) as {
      transactionRevision: string;
      rule: {
        active: boolean;
        merchantKey: string | null;
        revision: string | null;
      };
    };
    const ruleKey = merchantRuleKey({
      merchantName: movement.legs[0].merchantName,
      name: movement.legs[0].name
    });
    flushSync(() => {
      setMovementOverride((currentOverride) =>
        (currentOverride ?? displayMovements).map((entry) =>
          entry.kind === "TRANSACTION" &&
          entry.legs[0].transactionId === transactionId
            ? {
                ...entry,
                category: {
                  id: category.id,
                  name: category.name,
                  section: category.section,
                  archived: false
                },
                legs: [
                  {
                    ...entry.legs[0],
                    category: {
                      id: category.id,
                      name: category.name,
                      section: category.section,
                      archived: false
                    },
                    revision: payload.transactionRevision
                  }
                ]
              }
            : entry
        )
      );
      setRulesOverride((currentOverride) => {
        const current = currentOverride ?? displayRules;
        if (ruleAction === "PRESERVE") return current;
        const withoutCurrent = current.filter(
          (rule) => rule.merchantKey !== ruleKey
        );
        if (ruleAction === "DELETE" || !payload.rule.active) {
          return withoutCurrent;
        }
        return [
          ...withoutCurrent,
          {
            id:
              current.find((rule) => rule.merchantKey === ruleKey)?.id ??
              `local:${payload.rule.merchantKey}`,
            merchantKey: payload.rule.merchantKey ?? merchantKey,
            revision: payload.rule.revision ?? new Date().toISOString(),
            category: { id: category.id, name: category.name }
          }
        ];
      });
      setBusy(false);
    });
    announce(
      unresolvedCategoryQueue.length === 1
        ? `Category assigned to ${category.name}. Category review complete.`
        : `Category assigned to ${category.name}.`
    );
    if (focusAfter) moveFocus(focusAfter);
    return true;
  }

  function assignCategoryFromLedger(
    movement: TransactionMovement,
    category: CategoryReviewChoice,
    options: CategoryAssignmentOptions
  ) {
    return assignCategory(
      movement,
      category,
      options.ruleAction,
      options.merchantKey,
      options.expectedRuleRevision,
      null
    );
  }

  function skipCategory() {
    const current = categoryQueue[0];
    if (!current) return;
    setSkippedCategoryTransactionIds(
      (skipped) => new Set([...skipped, current.legs[0].transactionId])
    );
    announce("Category review item skipped for now.");
    moveFocus("category-review");
  }

  async function untie(movement: TransferMovement) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/transfers/${movement.matchId}`, {
      method: "DELETE"
    }).catch(() => null);
    if (!response?.ok) {
      setError(
        response
          ? await responseError(response)
          : "The transfer could not be untied. Check your connection and try again."
      );
      setBusy(false);
      return;
    }
    const restored = movement.legs.map(optimisticTransaction);
    setMovementOverride(
      sortMovements([
        ...displayMovements.filter((entry) => entry.id !== movement.id),
        ...restored
      ])
    );
    setLocallyMatchedTransactionIds((current) => {
      const next = new Set(current);
      for (const leg of movement.legs) next.delete(leg.transactionId);
      return next;
    });
    announce(
      "Transfer untied. Both unchanged source transactions are restored.",
      true
    );
    setBusy(false);
    moveFocus(`movement-transaction-${movement.legs[0].transactionId}`, true);
    window.setTimeout(() => router.refresh(), 1000);
  }

  const selectedMovements = filteredMovements.filter((movement) =>
    selectedMovementIds.has(movement.id)
  );
  const deferredSuggestionCount = unresolvedSuggestions.filter((suggestion) =>
    skippedSuggestionIds.has(suggestion.id)
  ).length;
  const deferredCategoryCount = unresolvedCategoryQueue.filter((movement) =>
    skippedCategoryTransactionIds.has(movement.legs[0].transactionId)
  ).length;
  const deferredCount = deferredSuggestionCount + deferredCategoryCount;
  const reviewCount =
    unresolvedSuggestions.length + unresolvedCategoryQueue.length;
  const todayMonth = new Date().toISOString().slice(0, 7);
  const resultNote = `${
    filteredMovements.length === displayMovements.length
      ? `${displayMovements.length} movement${
          displayMovements.length === 1 ? "" : "s"
        } in ${monthLabel(month)}`
      : `${filteredMovements.length} of ${displayMovements.length} movements shown`
  }${reviewFilter ? " · Review filter on" : ""}`;

  return (
    <div className="transactions-experience">
      <div
        ref={liveRegionRef}
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      <header className="transactions-header">
        <div className="transactions-header-main">
          <div className="transactions-period">
            <nav
              className="transactions-month-nav"
              aria-label="Transaction month"
            >
              <Link
                href={transactionHref(shiftMonth(month, -1), query)}
                aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}
              >
                <span aria-hidden="true">‹</span>
              </Link>
              <Link
                href={transactionHref(shiftMonth(month, 1), query)}
                aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}
              >
                <span aria-hidden="true">›</span>
              </Link>
            </nav>
            <div>
              <span className="eyebrow">{monthLabel(month)}</span>
              <h1>Transactions</h1>
              <span className="transactions-movement-count">
                {displayMovements.length} movement
                {displayMovements.length === 1 ? "" : "s"}
              </span>
            </div>
            <Link
              className="transactions-today"
              href={transactionHref(todayMonth, query)}
              aria-current={month === todayMonth ? "date" : undefined}
            >
              Today
            </Link>
          </div>
          <div className="transactions-header-actions">
            <form method="get" role="search" className="transactions-search">
              <input type="hidden" name="month" value={month} />
              <label className="visually-hidden" htmlFor="transaction-search">
                Search transactions
              </label>
              <input
                className="input"
                id="transaction-search"
                type="search"
                name="query"
                defaultValue={query}
                placeholder="Search merchant, amount, memo"
              />
              <button className="button secondary" type="submit">
                Search
              </button>
            </form>
            <button
              className="transactions-review-toggle"
              type="button"
              aria-pressed={reviewFilter}
              aria-controls="movement-ledger"
              onClick={() => {
                setReviewFilter((value) => !value);
                setSelectedMovementIds(new Set());
                setDetailMovementId(null);
              }}
            >
              Review
              <span>
                {reviewCount} item{reviewCount === 1 ? "" : "s"}
              </span>
            </button>
          </div>
        </div>
        <div className="transactions-filter-row">
          <div
            className="transactions-account-filters"
            aria-label="Filter by account"
          >
            <button
              type="button"
              aria-pressed={accountFilter === "all"}
              onClick={() => setAccountFilter("all")}
            >
              All accounts
            </button>
            {accounts.map((account) => (
              <button
                type="button"
                aria-pressed={accountFilter === account.id}
                key={account.id}
                onClick={() => setAccountFilter(account.id)}
              >
                {account.name}
                {account.mask ? ` · ${account.mask}` : ""}
                {!account.active ? " · inactive" : ""}
              </button>
            ))}
          </div>
          <p className="transactions-result-note" role="status">
            {resultNote}
            {query ? ` · Search: “${query}”` : ""}
          </p>
        </div>
      </header>
      {error ? (
        <div className="review-error" role="alert">
          {error}
        </div>
      ) : null}
      {reviewCount > 0 ? (
        <section
          id="transaction-review-stack"
          className="review-stack"
          aria-label="Transaction review queues"
        >
          {visibleSuggestions[0] ? (
            <TransferReview
              key={visibleSuggestions[0].id}
              suggestion={visibleSuggestions[0]}
              queueCount={unresolvedSuggestions.length}
              busy={busy}
              onTie={tie}
              onSkip={skipSuggestion}
            />
          ) : null}
          {categoryQueue[0] ? (
            <CategoryReview
              key={categoryQueue[0].legs[0].transactionId}
              movement={categoryQueue[0]}
              categories={categories}
              existingRule={
                displayRules.find(
                  (rule) =>
                    rule.merchantKey ===
                    merchantRuleKey({
                      merchantName: categoryQueue[0].legs[0].merchantName,
                      name: categoryQueue[0].legs[0].name
                    })
                ) ?? null
              }
              queueCount={unresolvedCategoryQueue.length}
              busy={busy}
              onAssign={(
                category,
                ruleAction,
                merchantKey,
                expectedRuleRevision
              ) =>
                assignCategory(
                  categoryQueue[0],
                  category,
                  ruleAction,
                  merchantKey,
                  expectedRuleRevision
                )
              }
              onSkip={skipCategory}
            />
          ) : null}
          {deferredCount > 0 ? (
            <div className="transaction-review-deferred" role="status">
              <div>
                <strong>
                  {deferredCount} review item{deferredCount === 1 ? "" : "s"}{" "}
                  deferred for now.
                </strong>
                <span>
                  {deferredSuggestionCount
                    ? `${deferredSuggestionCount} transfer suggestion${deferredSuggestionCount === 1 ? "" : "s"}`
                    : ""}
                  {deferredSuggestionCount && deferredCategoryCount
                    ? " · "
                    : ""}
                  {deferredCategoryCount
                    ? `${deferredCategoryCount} category assignment${deferredCategoryCount === 1 ? "" : "s"}`
                    : ""}
                  {deferredCount === 1
                    ? " remains unresolved."
                    : " remain unresolved."}
                </span>
              </div>
              <button
                className="button secondary"
                type="button"
                data-resume-deferred
                onClick={() => {
                  setSkippedSuggestionIds(new Set());
                  setSkippedCategoryTransactionIds(new Set());
                  announce("Deferred review items are available again.");
                  moveFocus("review");
                }}
              >
                Resume deferred review
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {reviewFilter && reviewCount === 0 ? (
        <div className="transaction-review-clear" role="status">
          <strong>Nothing to review.</strong>
          <span>
            Every transfer in this view is tied and every transaction has a
            category.
          </span>
        </div>
      ) : null}
      <section
        className="movement-ledger"
        id="movement-ledger"
        aria-labelledby="ledger-title"
      >
        <div className="movement-ledger-heading">
          <h2 id="ledger-title" tabIndex={-1}>
            Movement ledger
          </h2>
          <span className="muted">{resultNote}</span>
        </div>
        {filteredMovements.length ? (
          <>
            <div className="movement-table-header" aria-hidden="true">
              <span />
              <span>Date</span>
              <span>Description</span>
              <span>Category</span>
              <span>Account</span>
              <span>Amount</span>
              <span />
            </div>
            <div className="movement-list" role="list">
              {filteredMovements.map((movement) => (
                <TransactionRow
                  key={movement.id}
                  movement={movement}
                  selected={selectedMovementIds.has(movement.id)}
                  untieBusy={busy}
                  onSelect={(selected) =>
                    setSelectedMovementIds((current) => {
                      const next = new Set(current);
                      if (selected) next.add(movement.id);
                      else next.delete(movement.id);
                      return next;
                    })
                  }
                  onOpenDetail={(trigger) => {
                    setDetailReturnFocus(trigger);
                    setDetailMovementId(movement.id);
                  }}
                  onUntie={movement.kind === "TRANSFER" ? untie : undefined}
                  categories={categories}
                  existingRule={
                    movement.kind === "TRANSACTION"
                      ? (displayRules.find(
                          (rule) =>
                            rule.merchantKey ===
                            merchantRuleKey({
                              merchantName: movement.legs[0].merchantName,
                              name: movement.legs[0].name
                            })
                        ) ?? null)
                      : null
                  }
                  onAssignCategory={assignCategoryFromLedger}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>No movements match this view</h3>
            <p className="muted">
              {displayMovements.length
                ? reviewFilter
                  ? "Turn off Review or choose another account to see more activity."
                  : "Choose another account or clear the search to see more activity."
                : `No transaction activity is available for ${monthLabel(month)}.`}
            </p>
          </div>
        )}
      </section>
      {selectedMovements.length > 0 ? (
        <aside
          className="transactions-bulk-bar"
          aria-label="Selected movement actions"
        >
          <strong>{selectedMovements.length} selected</strong>
          <button
            className="button secondary"
            type="button"
            onClick={(event) => {
              setDetailReturnFocus(event.currentTarget);
              setDetailMovementId(selectedMovements[0].id);
            }}
          >
            Open first selected
          </button>
          <button
            className="button secondary"
            type="button"
            disabled
            aria-describedby="bulk-category-unavailable"
          >
            Assign category to selected
          </button>
          <span id="bulk-category-unavailable">
            Bulk persistence is not supported by the current API. No changes
            have been made.
          </span>
          <button
            className="transactions-clear-selection"
            type="button"
            onClick={() => setSelectedMovementIds(new Set())}
          >
            Clear selection
          </button>
        </aside>
      ) : null}
      <TransactionDetailDrawer
        movement={detailMovement}
        categories={categories}
        existingRule={
          detailMovement?.kind === "TRANSACTION"
            ? (displayRules.find(
                (rule) =>
                  rule.merchantKey ===
                  merchantRuleKey({
                    merchantName: detailMovement.legs[0].merchantName,
                    name: detailMovement.legs[0].name
                  })
              ) ?? null)
            : null
        }
        busy={busy}
        returnFocus={detailReturnFocus}
        onClose={() => setDetailMovementId(null)}
        onAssignCategory={assignCategoryFromLedger}
        onUntie={untie}
      />
    </div>
  );
}
