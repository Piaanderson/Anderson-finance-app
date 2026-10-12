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
import type { MerchantRuleAction } from "./transactions-workspace";

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
    ruleAction: MerchantRuleAction,
    merchantKey: string,
    expectedRuleRevision: string | null
  ) => void;
  onSkip: () => void;
}) {
  const reactId = useId().replaceAll(":", "");
  const headingId = `category-review-${reactId}`;
  const [selectedId, setSelectedId] = useState(existingRule?.category.id ?? "");
  const [ruleAction, setRuleAction] = useState<MerchantRuleAction>("PRESERVE");
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
      <div className="review-progress">
        <span>
          {queueCount} transaction{queueCount === 1 ? "" : "s"} remaining
        </span>
        <span className="review-progress-track" aria-hidden="true">
          {Array.from({ length: Math.min(queueCount, 8) }, (_, index) => (
            <i key={index} />
          ))}
        </span>
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

      <div className="field merchant-rule-action-field">
        <label htmlFor={`review-merchant-rule-action-${reactId}`}>
          Exact merchant rule
        </label>
        <select
          className="input"
          id={`review-merchant-rule-action-${reactId}`}
          value={ruleAction}
          onChange={(event) =>
            setRuleAction(event.target.value as MerchantRuleAction)
          }
        >
          <option value="PRESERVE">
            {existingRule
              ? `Keep existing rule → ${existingRule.category.name}`
              : "Do not create a rule"}
          </option>
          {!ruleUnavailable ? (
            <option value="UPSERT">
              {existingRule
                ? "Retarget existing rule"
                : "Create exact merchant rule"}
            </option>
          ) : null}
          {existingRule ? (
            <option value="DELETE">Delete existing rule</option>
          ) : null}
        </select>
        <p className="muted">
          {ruleAction === "PRESERVE"
            ? existingRule
              ? `The existing “${existingRule.merchantKey}” rule stays assigned to ${existingRule.category.name}.`
              : "Only this transaction will be assigned."
            : ruleAction === "DELETE"
              ? `The existing “${existingRule?.merchantKey}” rule will be deleted.`
              : "The exact key below will be assigned to the selected category."}
        </p>
      </div>
      <div className="field merchant-rule-key-field">
        <label htmlFor={`merchant-rule-key-${reactId}`}>
          Exact normalized merchant key
        </label>
        <input
          className="input"
          id={`merchant-rule-key-${reactId}`}
          type="text"
          value={ruleKeyInput}
          readOnly={ruleAction !== "UPSERT" || ruleUnavailable}
          required={ruleAction === "UPSERT"}
          maxLength={120}
          aria-describedby={`merchant-rule-key-hint-${reactId}`}
          onChange={(event) => setRuleKeyInput(event.target.value)}
          onBlur={() => setRuleKeyInput(normalizedRuleKey)}
        />
        <p className="muted" id={`merchant-rule-key-hint-${reactId}`}>
          {ruleUnavailable
            ? "No usable merchant text is available, so only this transaction can be assigned."
            : ruleAction === "UPSERT"
              ? `Will save exactly as “${normalizedRuleKey}”. You can edit this key before assignment.`
              : ruleAction === "DELETE"
                ? "The existing exact rule will be deleted."
                : "The existing exact rule, if any, will be preserved unchanged."}
        </p>
      </div>

      <div className="review-actions">
        <button
          className="button"
          type="button"
          disabled={
            !selected ||
            busy ||
            (ruleAction === "UPSERT" && normalizedRuleKey.length === 0)
          }
          data-category-primary-action
          onClick={() => {
            if (selected) {
              onAssign(
                selected,
                ruleAction,
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
