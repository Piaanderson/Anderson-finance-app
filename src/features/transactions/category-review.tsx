"use client";

import { useId, useState } from "react";
import type {
  CategoryReviewChoice,
  MerchantRuleReview
} from "@/features/categories/category-data";
import { GroupedCategoryPicker } from "@/features/categories/grouped-category-picker";
import {
  merchantRuleKey,
  normalizeMerchantRuleKey
} from "@/features/categories/merchant-rule";
import { formatMovementAmount } from "@/lib/money";
import type { TransactionMovement } from "./movements";

function movementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function movementAmount(movement: TransactionMovement) {
  const amount = movement.amounts[0];
  const formatted = formatMovementAmount(amount.value, amount.currency);
  if (movement.direction === "OUTFLOW") return `−${formatted}`;
  if (movement.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

export function CategoryReview({
  movement,
  categories,
  existingRule,
  queueCount,
  busy,
  onAssign,
  onSkip
}: {
  movement: TransactionMovement;
  categories: CategoryReviewChoice[];
  existingRule: MerchantRuleReview | null;
  queueCount: number;
  busy: boolean;
  onAssign: (
    category: CategoryReviewChoice,
    createRule: boolean,
    merchantKey: string,
    expectedRuleRevision: string | null
  ) => void;
  onSkip: () => void;
}) {
  const reactId = useId().replaceAll(":", "");
  const headingId = `category-review-${reactId}`;
  const [selectedId, setSelectedId] = useState(existingRule?.category.id ?? "");
  const [createRule, setCreateRule] = useState(Boolean(existingRule));
  const defaultRuleKey = merchantRuleKey({
    merchantName: movement.legs[0].merchantName,
    name: movement.legs[0].name
  });
  const [ruleKeyInput, setRuleKeyInput] = useState(defaultRuleKey);
  const normalizedRuleKey = normalizeMerchantRuleKey(ruleKeyInput);
  const selected =
    categories.find((category) => category.id === selectedId) ?? null;
  const ruleUnavailable = defaultRuleKey.length === 0;

  return (
    <section
      className="card category-review category-review-active"
      aria-labelledby={headingId}
      data-review-order="categories"
    >
      <div className="review-heading">
        <div>
          <span className="eyebrow">
            Categories second · {queueCount} to review
          </span>
          <h2 id={headingId}>Categories to assign</h2>
        </div>
        <span className="review-status">Choose one category</span>
      </div>

      <div className="category-review-transaction">
        <div>
          <h3>{movement.description}</h3>
          <p className="muted">
            {movement.legs[0].account.name} ·{" "}
            {movementDate(movement.canonicalDate)}
            {movement.pending ? " · Pending" : ""}
          </p>
        </div>
        <strong className="row-amount">{movementAmount(movement)}</strong>
      </div>

      <GroupedCategoryPicker
        categories={categories}
        value={selectedId}
        onChange={(category) => setSelectedId(category.id)}
        initialOpen
        hint="Use arrow keys and Enter, or choose by touch."
      />

      <label className="merchant-rule-choice">
        <input
          type="checkbox"
          checked={createRule}
          disabled={ruleUnavailable}
          onChange={(event) => setCreateRule(event.target.checked)}
        />
        <span>
          <strong>Use this category for future exact merchant matches</strong>
          <span>
            Exact matches only; no fuzzy or substring matching.
            {existingRule
              ? ` Existing rule: ${existingRule.category.name}. Uncheck to remove it.`
              : " Optional; leave unchecked for this transaction only."}
          </span>
        </span>
      </label>
      <div className="field merchant-rule-key-field">
        <label htmlFor={`merchant-rule-key-${reactId}`}>
          Exact normalized merchant key
        </label>
        <input
          className="input"
          id={`merchant-rule-key-${reactId}`}
          type="text"
          value={ruleKeyInput}
          readOnly={!createRule || ruleUnavailable}
          required={createRule}
          maxLength={120}
          aria-describedby={`merchant-rule-key-hint-${reactId}`}
          onChange={(event) => setRuleKeyInput(event.target.value)}
          onBlur={() => setRuleKeyInput(normalizedRuleKey)}
        />
        <p className="muted" id={`merchant-rule-key-hint-${reactId}`}>
          {ruleUnavailable
            ? "No usable merchant text is available, so only this transaction can be assigned."
            : `Will save exactly as “${normalizedRuleKey}”. You can edit this key before assignment.`}
        </p>
      </div>

      <div className="review-actions">
        <button
          className="button"
          type="button"
          disabled={!selected || busy}
          data-category-primary-action
          onClick={() => {
            if (selected) {
              onAssign(
                selected,
                createRule,
                normalizedRuleKey,
                existingRule?.revision ?? null
              );
            }
          }}
        >
          {busy ? "Assigning…" : "Assign category"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onSkip}
        >
          Skip for now
        </button>
      </div>
    </section>
  );
}
