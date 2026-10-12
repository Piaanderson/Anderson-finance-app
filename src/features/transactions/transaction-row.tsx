"use client";

import { useId, useRef, useState } from "react";
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
import type {
  CategoryAssignmentOptions,
  MerchantRuleAction
} from "./transactions-workspace";
import type { HouseholdMovement, TransactionMovement } from "./movements";
import { TransferDetails } from "./transfer-details";

function movementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function transactionAmount(movement: HouseholdMovement) {
  const amount = movement.amounts[0];
  const formatted = formatMovementAmount(amount.value, amount.currency);
  if (movement.direction === "OUTFLOW") return `−${formatted}`;
  if (movement.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

function transferAmount(movement: HouseholdMovement) {
  return movement.amounts
    .map((amount) => formatMovementAmount(amount.value, amount.currency))
    .join(" → ");
}

export function TransactionRow({
  movement,
  selected = false,
  untieBusy = false,
  onSelect,
  onOpenDetail,
  onUntie,
  categories = [],
  existingRule = null,
  onAssignCategory
}: {
  movement: HouseholdMovement;
  selected?: boolean;
  untieBusy?: boolean;
  onSelect?: (selected: boolean) => void;
  onOpenDetail?: (trigger: HTMLButtonElement) => void;
  onUntie?: (
    movement: Extract<HouseholdMovement, { kind: "TRANSFER" }>
  ) => void;
  categories?: CategoryReviewChoice[];
  existingRule?: MerchantRuleReview | null;
  onAssignCategory?: (
    movement: TransactionMovement,
    category: CategoryReviewChoice,
    options: CategoryAssignmentOptions
  ) => Promise<boolean>;
}) {
  const reactId = useId().replaceAll(":", "");
  const detailId = `movement-details-${reactId}`;
  const labelId = `movement-label-${reactId}`;
  const categoryId = `movement-category-${reactId}`;
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const saveCategoryRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    movement.category?.id ?? ""
  );
  const defaultRuleKey =
    movement.kind === "TRANSACTION"
      ? merchantRuleKey({
          merchantName: movement.legs[0].merchantName,
          name: movement.legs[0].name
        })
      : "";
  const [ruleAction, setRuleAction] = useState<MerchantRuleAction>("PRESERVE");
  const [ruleKeyInput, setRuleKeyInput] = useState(
    existingRule?.merchantKey ?? defaultRuleKey
  );
  const [inlineError, setInlineError] = useState("");
  const normalizedRuleKey = normalizeMerchantRuleKey(ruleKeyInput);
  const ruleUnavailable = defaultRuleKey.length === 0;
  const transfer = movement.kind === "TRANSFER";
  const accountLabels = movement.legs.map(
    (leg) =>
      `${leg.account.name}${leg.account.mask ? ` · ${leg.account.mask}` : ""}`
  );
  const accounts = accountLabels.join(" → ");
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const assignmentUnchanged =
    selectedCategory?.id === movement.category?.id && ruleAction === "PRESERVE";

  return (
    <article
      className={`movement-row${onSelect ? " movement-row-integrated" : ""}`}
      role={onSelect ? "listitem" : undefined}
      id={
        movement.kind === "TRANSACTION"
          ? `movement-transaction-${movement.legs[0].transactionId}`
          : `movement-transfer-${movement.matchId}`
      }
      tabIndex={-1}
      aria-labelledby={labelId}
    >
      <div className="movement-summary">
        <div className="movement-cell movement-select-cell">
          {onSelect ? (
            <label className="movement-select">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelect(event.target.checked)}
              />
              <span className="visually-hidden">
                Select {movement.description}
              </span>
            </label>
          ) : null}
        </div>
        <div className="movement-cell movement-date" data-label="Date">
          <span>{movementDate(movement.canonicalDate)}</span>
          {movement.pending ? (
            <span className="movement-state">Pending</span>
          ) : null}
        </div>
        <div
          className="movement-cell movement-description"
          data-label="Description"
        >
          <h3 id={labelId}>
            {onOpenDetail ? (
              <button
                className="movement-detail-trigger"
                type="button"
                onClick={(event) => onOpenDetail(event.currentTarget)}
              >
                {movement.description}
              </button>
            ) : (
              movement.description
            )}
          </h3>
          {transfer ? (
            <p className="movement-transfer-route">
              <span>{accountLabels[0]}</span>
              <span aria-hidden="true" className="movement-route-line" />
              <span>{accountLabels[1]}</span>
              <span>Internal transfer · counted once</span>
            </p>
          ) : (
            <p className="muted">
              {movement.direction === "OUTFLOW"
                ? "Money out"
                : movement.direction === "INFLOW"
                  ? "Money in"
                  : "No balance change"}
            </p>
          )}
        </div>
        <div
          className="movement-cell movement-category-cell"
          data-label="Category"
        >
          {transfer ? (
            <span className="movement-category">Transfer</span>
          ) : onAssignCategory ? (
            <button
              ref={categoryTriggerRef}
              className="movement-category movement-category-button"
              type="button"
              aria-expanded={categoryOpen}
              aria-controls={categoryId}
              onClick={() => setCategoryOpen((value) => !value)}
            >
              {movement.category?.name ?? "Uncategorized"}
            </button>
          ) : (
            <span className="movement-category">
              {movement.category?.name ?? "Uncategorized"}
            </span>
          )}
        </div>
        <div className="movement-cell movement-account" data-label="Account">
          {accounts}
        </div>
        <div className="movement-cell movement-amount" data-label="Amount">
          <strong>
            {transfer ? transferAmount(movement) : transactionAmount(movement)}
          </strong>
        </div>
        <div className="movement-cell movement-row-action">
          {transfer ? (
            <button
              className="movement-disclosure"
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpanded((value) => !value)}
            >
              <span>
                {expanded
                  ? "Hide both transfer legs"
                  : "View both transfer legs"}
              </span>
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          ) : onOpenDetail ? (
            <button
              className="movement-open-detail"
              type="button"
              onClick={(event) => onOpenDetail(event.currentTarget)}
            >
              Details
            </button>
          ) : null}
        </div>
      </div>
      {!transfer && categoryOpen ? (
        <div
          className="movement-inline-category"
          id={categoryId}
          aria-label={`Category for ${movement.description}`}
        >
          <div className="movement-inline-category-heading">
            <span className="eyebrow">Category for {movement.description}</span>
            <span className="muted">Search every active category</span>
          </div>
          <GroupedCategoryPicker
            categories={categories}
            value={selectedCategoryId}
            onChange={(category) => setSelectedCategoryId(category.id)}
            label="Choose a category"
            hint="Use arrow keys and Enter, or choose by touch."
            initialOpen
          />
          <div className="field merchant-rule-action-field">
            <label htmlFor={`inline-merchant-rule-action-${reactId}`}>
              Exact merchant rule
            </label>
            <select
              className="input"
              id={`inline-merchant-rule-action-${reactId}`}
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
            <label htmlFor={`inline-merchant-rule-${reactId}`}>
              Exact normalized merchant key
            </label>
            <input
              className="input"
              id={`inline-merchant-rule-${reactId}`}
              type="text"
              value={ruleKeyInput}
              readOnly={ruleAction !== "UPSERT" || ruleUnavailable}
              required={ruleAction === "UPSERT"}
              maxLength={120}
              aria-describedby={`inline-merchant-rule-hint-${reactId}`}
              onChange={(event) => setRuleKeyInput(event.target.value)}
              onBlur={() => setRuleKeyInput(normalizedRuleKey)}
            />
            <p className="muted" id={`inline-merchant-rule-hint-${reactId}`}>
              {ruleUnavailable
                ? "No usable merchant text is available, so no merchant rule can be created."
                : ruleAction === "UPSERT"
                  ? `Will save exactly as “${normalizedRuleKey}”.`
                  : ruleAction === "DELETE"
                    ? "The existing exact rule will be deleted."
                    : "The existing exact rule, if any, will be preserved unchanged."}
            </p>
          </div>
          {inlineError ? (
            <p className="review-error" role="alert">
              {inlineError}
            </p>
          ) : null}
          <div className="movement-inline-actions">
            <button
              ref={saveCategoryRef}
              className="button"
              type="button"
              disabled={
                untieBusy ||
                !selectedCategory ||
                assignmentUnchanged ||
                (ruleAction === "UPSERT" && normalizedRuleKey.length === 0)
              }
              onClick={async () => {
                if (selectedCategory) {
                  setInlineError("");
                  const saved = await onAssignCategory?.(
                    movement,
                    selectedCategory,
                    {
                      ruleAction,
                      merchantKey: normalizedRuleKey,
                      expectedRuleRevision: existingRule?.revision ?? null
                    }
                  );
                  if (saved) {
                    setCategoryOpen(false);
                    requestAnimationFrame(() =>
                      categoryTriggerRef.current?.focus()
                    );
                  } else {
                    setInlineError(
                      "Category was not saved. Review the error and try again."
                    );
                    requestAnimationFrame(() =>
                      saveCategoryRef.current?.focus()
                    );
                  }
                }
              }}
            >
              {untieBusy ? "Saving…" : "Save category"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setCategoryOpen(false);
                requestAnimationFrame(() =>
                  categoryTriggerRef.current?.focus()
                );
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {transfer && expanded ? (
        <TransferDetails
          id={detailId}
          labelledBy={labelId}
          legs={movement.legs}
          untieBusy={untieBusy}
          onUntie={onUntie ? () => onUntie(movement) : undefined}
        />
      ) : null}
    </article>
  );
}
