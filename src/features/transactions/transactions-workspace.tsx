"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TransactionRow } from "./transaction-row";
import { TransferReview } from "./transfer-review";
import type {
  TransferSuggestion,
  TransferSuggestionCandidate
} from "./transfer-suggestions";

const ANNOUNCEMENT_STORAGE_KEY = "currents:transactions:announcement";
const FOCUS_STORAGE_KEY = "currents:transactions:focus";

function focusElement(target: string) {
  if (target === "review") {
    return (
      document.querySelector<HTMLElement>("[data-transfer-primary-action]") ??
      document.querySelector<HTMLElement>(".category-combobox input") ??
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
    category: null,
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
  rules
}: {
  movements: HouseholdMovement[];
  suggestions: TransferSuggestion[];
  categories: CategoryReviewChoice[];
  rules: MerchantRuleReview[];
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

  const visibleSuggestions = useMemo(
    () =>
      suggestions
        .filter(
          (suggestion) =>
            !skippedSuggestionIds.has(suggestion.id) &&
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
    [locallyMatchedTransactionIds, skippedSuggestionIds, suggestions]
  );
  const categoryQueue = useMemo(
    () =>
      displayMovements.filter(
        (movement): movement is TransactionMovement =>
          movement.kind === "TRANSACTION" &&
          movement.category === null &&
          !skippedCategoryTransactionIds.has(movement.legs[0].transactionId)
      ),
    [displayMovements, skippedCategoryTransactionIds]
  );

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
    createRule: boolean
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
          createRule
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
      return;
    }
    setMovementOverride(
      displayMovements.map((entry) =>
        entry.kind === "TRANSACTION" &&
        entry.legs[0].transactionId === transactionId
          ? {
              ...entry,
              category: {
                id: category.id,
                name: category.name,
                section: category.section,
                archived: false
              }
            }
          : entry
      )
    );
    const ruleKey = merchantRuleKey({
      merchantName: movement.legs[0].merchantName,
      name: movement.legs[0].name
    });
    setRulesOverride((currentOverride) => {
      const current = currentOverride ?? displayRules;
      const withoutCurrent = current.filter(
        (rule) => rule.merchantKey !== ruleKey
      );
      if (!createRule) return withoutCurrent;
      return [
        ...withoutCurrent,
        {
          id: `local:${ruleKey}`,
          merchantKey: ruleKey,
          category: { id: category.id, name: category.name }
        }
      ];
    });
    announce(
      categoryQueue.length === 1
        ? `Category assigned to ${category.name}. Category review complete.`
        : `Category assigned to ${category.name}.`,
      true
    );
    setBusy(false);
    moveFocus("category-review", true);
    window.setTimeout(() => router.refresh(), 1000);
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

  return (
    <>
      <div
        ref={liveRegionRef}
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {error ? (
        <div className="review-error" role="alert">
          {error}
        </div>
      ) : null}
      {visibleSuggestions.length > 0 || categoryQueue.length > 0 ? (
        <section
          className="review-stack"
          aria-label="Transaction review queues"
        >
          {visibleSuggestions[0] ? (
            <TransferReview
              key={visibleSuggestions[0].id}
              suggestion={visibleSuggestions[0]}
              queueCount={visibleSuggestions.length}
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
              queueCount={categoryQueue.length}
              busy={busy}
              onAssign={(category, createRule) =>
                assignCategory(categoryQueue[0], category, createRule)
              }
              onSkip={skipCategory}
            />
          ) : null}
        </section>
      ) : null}
      <section className="card movement-ledger" aria-labelledby="ledger-title">
        <div className="section-heading">
          <h2 id="ledger-title" tabIndex={-1}>
            Movement ledger
          </h2>
          <span className="muted">{displayMovements.length} movements</span>
        </div>
        {displayMovements.length ? (
          <div className="movement-list">
            {displayMovements.map((movement) => (
              <TransactionRow
                key={movement.id}
                movement={movement}
                untieBusy={busy}
                onUntie={movement.kind === "TRANSFER" ? untie : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>No transactions yet</h2>
            <p className="muted">
              Connect an account and start the sync worker to fill this ledger.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
